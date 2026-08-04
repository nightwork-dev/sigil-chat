import { formatInjectionBlock } from "@gonk/knowledge/injection"
import type {
  KnowledgeContainerRef,
  KnowledgeHit,
  KnowledgePage,
} from "@gonk/knowledge/types"
import {
  ScopedKnowledgeAccessError,
  type ScopedKnowledgeStore,
} from "@gonk/knowledge/scoped"
import {
  RetrievalSourceRegistry,
  canonicalResourceKey,
  type NativeRetrievalCandidate,
  type RetrievalHit,
  type RetrievalResourceRef,
  type RetrievalResolveResult,
} from "@gonk/retrieval"
import {
  createRetrievalContextContributor,
  type RetrievalContextSelection,
} from "@gonk/retrieval/context"
import {
  securityContextKey,
  type AuthContext,
  type AuthenticatedPrincipal,
} from "@gonk/auth"
import type { ContextContributor } from "@gonk/context"
import type {
  SigilEvidenceCandidate,
  SigilRetrievalEvidenceCoordinator,
} from "@workspace/agent-tools/evidence"

export const SIGIL_KNOWLEDGE_RETRIEVAL_SOURCE_ID = "sigil.knowledge"
export const SIGIL_KNOWLEDGE_CONTEXT_CONTRIBUTOR_ID = "sigil.retrieval"

const DEFAULT_PASSIVE_KNOWLEDGE_LIMIT = 5
const DEFAULT_PASSIVE_KNOWLEDGE_THRESHOLD = 0.72
const SOURCE_PRIORITY = 50
const FILTER_SCHEMA_ID = "sigil.knowledge.context-filter"

export interface SigilKnowledgeContextOptions {
  authContext?: AuthContext
  retrievalEvidenceCoordinator: SigilRetrievalEvidenceCoordinator
  store: ScopedKnowledgeStore
  thresholdForPersona?: (personaId: string | undefined) => number | undefined
  limit?: number
}

export function createSigilKnowledgeContextContributor(
  options: SigilKnowledgeContextOptions,
): ContextContributor {
  const registry = new RetrievalSourceRegistry()
  registry.register(createSigilKnowledgeRetrievalSource(options))
  const selectionsByRequest = new Map<
    string,
    readonly RetrievalContextSelection[]
  >()

  return createRetrievalContextContributor({
    contributorId: SIGIL_KNOWLEDGE_CONTEXT_CONTRIBUTOR_ID,
    registry,
    engine: {
      resolve: ({ auth, requestId, resource }) =>
        resolveSigilKnowledgeResource(options, resource, auth, requestId),
    },
    authForRequest: async (_requestId, principal) =>
      matchingAuthContext(options.authContext, principal) ??
      authContextForPrincipal(principal),
    selections: async (request) => {
      const cacheKey = knowledgeSelectionCacheKey(request)
      if (request.query !== undefined) {
        const auth =
          matchingAuthContext(options.authContext, request.principal) ??
          authContextForPrincipal(request.principal)
        const selections = await selectKnowledgeContext(
          {
            auth,
            query: request.query,
          },
          options,
        )
        selectionsByRequest.set(cacheKey, selections)
        trimSelectionCache(selectionsByRequest)
        return selections
      }
      return selectionsByRequest.get(cacheKey) ?? []
    },
  })
}

export async function selectKnowledgeContext(
  request: {
    auth: AuthContext
    query?: string
  },
  options: SigilKnowledgeContextOptions,
): Promise<readonly RetrievalContextSelection[]> {
  const activeContainer = activeKnowledgeContainer(request.auth.principal)
  if (!activeContainer) return []
  const query = request.query?.trim() ?? ""
  if (!query) return []
  const threshold =
    validThreshold(
      options.thresholdForPersona?.(personaId(request.auth.principal)),
    ) ?? DEFAULT_PASSIVE_KNOWLEDGE_THRESHOLD
  const queryTerms = relevanceTerms(query)
  if (queryTerms.length === 0) return []

  try {
    const result = await options.store.query({
      principal: { principalId: request.auth.principal.id },
      activeContainer,
      text: query,
      limit: Math.max((options.limit ?? DEFAULT_PASSIVE_KNOWLEDGE_LIMIT) * 4, 20),
    })
    const candidates = result.results
      .map((hit) => ({
        hit,
        relevance: absoluteRelevance(queryTerms, hit),
      }))
      .filter(({ relevance }) => relevance >= threshold)
      .sort((left, right) => {
        if (right.relevance !== left.relevance) {
          return right.relevance - left.relevance
        }
        return right.hit.score - left.hit.score
      })
      .slice(0, options.limit ?? DEFAULT_PASSIVE_KNOWLEDGE_LIMIT)
      .map(({ hit, relevance }) => evidenceCandidateForKnowledge(hit, relevance))
    const coordinated = await options.retrievalEvidenceCoordinator.collect({
      auth: request.auth,
      question: query,
      resultLimit: options.limit ?? DEFAULT_PASSIVE_KNOWLEDGE_LIMIT,
      candidates,
    })
    const hitByResourceKey = new Map(
      candidates.map((candidate) => [
        canonicalResourceKey(candidate.hit.resource),
        candidate.hit,
      ]),
    )
    return coordinated.packets.flatMap((packet) => {
      const hit = hitByResourceKey.get(packet.resourceKey)
      if (!hit) return []
      return [
        {
          candidateId: `knowledge:${packet.resourceKey}`,
          hit,
          necessity: "optional" as const,
          priority: packet.ranking.final,
          estimatedTokens: packet.budget.estimatedTokens,
          estimateQuality: packet.budget.estimateQuality,
        },
      ]
    })
  } catch (error) {
    if (error instanceof ScopedKnowledgeAccessError) return []
    throw error
  }
}

function createSigilKnowledgeRetrievalSource(options: SigilKnowledgeContextOptions) {
  return {
    description: {
      id: SIGIL_KNOWLEDGE_RETRIEVAL_SOURCE_ID,
      label: "Sigil scoped knowledge",
      mode: "native-index" as const,
      rankingContract: "source-enforced-authorized-corpus" as const,
      revisionResolution: "current-only" as const,
      resourceKinds: ["knowledge-page"],
      priority: SOURCE_PRIORITY,
      filter: {
        schemaId: FILTER_SCHEMA_ID,
        schemaVersion: 1,
      },
    },
    filterSchema: emptyFilterSchema(),
    search: async (
      request: {
        principal: AuthenticatedPrincipal
        text: string
        limit: number
      },
      auth: AuthContext,
    ): Promise<readonly NativeRetrievalCandidate[]> => {
      const activeContainer = activeKnowledgeContainer(auth.principal)
      if (!activeContainer) return []
      const threshold = validThreshold(
        options.thresholdForPersona?.(personaId(auth.principal)),
      )
      const query = request.text.trim()
      if (!query) return []
      try {
        const result = await options.store.query({
          principal: { principalId: request.principal.id },
          activeContainer,
          text: query,
          limit: Math.max(request.limit * 4, 20),
        })
        const queryTerms = relevanceTerms(query)
        return result.results
          .map((hit) => ({
            hit,
            relevance: absoluteRelevance(queryTerms, hit),
          }))
          .filter(
            ({ relevance }) =>
              relevance >= (threshold ?? DEFAULT_PASSIVE_KNOWLEDGE_THRESHOLD),
          )
          .sort((left, right) => {
            if (right.relevance !== left.relevance) {
              return right.relevance - left.relevance
            }
            return right.hit.score - left.hit.score
          })
          .slice(0, request.limit)
          .map(({ hit, relevance }) =>
            nativeCandidateForKnowledge(hit, relevance),
          )
      } catch (error) {
        if (error instanceof ScopedKnowledgeAccessError) return []
        throw error
      }
    },
    resolve: async (resource: RetrievalResourceRef, auth: AuthContext) => {
      const resolved = await resolveSigilKnowledgeResource(
        options,
        resource,
        auth,
        crypto.randomUUID(),
      )
      if (resolved.status === "resolved") {
        return { status: "resolved" as const, value: resolved.value }
      }
      if (resolved.status === "changed") {
        return {
          status: "changed" as const,
          requested: resolved.requested,
          current: resolved.current,
        }
      }
      return resolved.status === "deleted"
        ? { status: "deleted" as const, resource: resolved.resource }
        : {
            status: "revision-unavailable" as const,
            resource: resolved.resource,
          }
    },
  }
}

async function resolveSigilKnowledgeResource(
  options: SigilKnowledgeContextOptions,
  resource: RetrievalResourceRef,
  auth: AuthContext,
  requestId: string,
): Promise<RetrievalResolveResult> {
  const activeContainer = activeKnowledgeContainer(auth.principal)
  const ref = parseKnowledgeResource(resource)
  if (!activeContainer || !ref) {
    return unresolvedKnowledgeResource(resource, requestId, "revision-unavailable")
  }
  try {
    const result = await options.store.get({
      principal: { principalId: auth.principal.id },
      activeContainer,
      id: ref.pageId,
    })
    const page = result.pages.find(
      (candidate) =>
        sameContainer(candidate.container, ref.container) &&
        candidate.revision === Number(resource.revision),
    )
    if (!page) {
      return unresolvedKnowledgeResource(resource, requestId, "revision-unavailable")
    }
    return {
      status: "resolved" as const,
      value: {
        resource,
        label: page.title,
        content: formatKnowledgePointer(page),
        audience: "public" as const,
      },
      receipt: {
        kind: "retrieval-resolve" as const,
        receiptVersion: 1 as const,
        requestId,
        timestamp: new Date().toISOString(),
        resourceKey: canonicalResourceKey(resource),
        outcome: "resolved" as const,
      },
    }
  } catch (error) {
    if (error instanceof ScopedKnowledgeAccessError) {
      return unresolvedKnowledgeResource(resource, requestId, "deleted")
    }
    throw error
  }
}

function unresolvedKnowledgeResource(
  resource: RetrievalResourceRef,
  requestId: string,
  status: "revision-unavailable" | "deleted" | "unauthorized",
): RetrievalResolveResult {
  return {
    status,
    resource,
    receipt: {
      kind: "retrieval-resolve",
      receiptVersion: 1,
      requestId,
      timestamp: new Date().toISOString(),
      resourceKey: canonicalResourceKey(resource),
      outcome: status,
    },
  }
}

function evidenceCandidateForKnowledge(
  hit: KnowledgeHit & {
    page: KnowledgePage & { container: KnowledgeContainerRef; revision: number }
  },
  relevance: number,
): SigilEvidenceCandidate {
  const retrievalHit = retrievalHitForKnowledge(hit, relevance)
  return {
    citation: {
      citationId: "",
      source: "knowledge",
      pageId: hit.page.id,
      title: hit.page.title,
      container: hit.page.container,
      revision: hit.page.revision,
      quote: formatKnowledgePointer(hit.page),
      score: hit.score,
      matchedTerms: [...retrievalHit.matchedTerms],
    },
    hit: retrievalHit,
  }
}

function knowledgeSelectionCacheKey(request: {
  requestId: string
  principal: AuthenticatedPrincipal
}): string {
  return `${request.requestId}:${securityContextKey({ principal: request.principal })}`
}

function trimSelectionCache(
  selectionsByRequest: Map<string, readonly RetrievalContextSelection[]>,
): void {
  const maximumCachedRequests = 256
  while (selectionsByRequest.size > maximumCachedRequests) {
    const firstKey = selectionsByRequest.keys().next().value
    if (firstKey === undefined) break
    selectionsByRequest.delete(firstKey)
  }
}

function matchingAuthContext(
  auth: AuthContext | undefined,
  principal: AuthenticatedPrincipal,
): AuthContext | undefined {
  if (!auth) return undefined
  return securityContextKey({ principal: auth.principal }) ===
    securityContextKey({ principal })
    ? auth
    : undefined
}

function nativeCandidateForKnowledge(
  hit: KnowledgeHit & {
    page: KnowledgePage & { container: KnowledgeContainerRef; revision: number }
  },
  relevance: number,
): NativeRetrievalCandidate {
  return {
    resource: knowledgeResourceRef(hit.page),
    audience: "public",
    lexicalScore: relevance,
  }
}

function retrievalHitForKnowledge(
  hit: KnowledgeHit & {
    page: KnowledgePage & { container: KnowledgeContainerRef; revision: number }
  },
  relevance: number,
): RetrievalHit {
  return {
    resource: knowledgeResourceRef(hit.page),
    audience: "public",
    scores: {
      lexical: {
        algorithm: "native",
        sourceId: SIGIL_KNOWLEDGE_RETRIEVAL_SOURCE_ID,
        value: relevance,
      },
      sourcePriority: SOURCE_PRIORITY,
      final: relevance + SOURCE_PRIORITY,
    },
    matchedTerms: relevanceTerms(`${hit.page.title} ${hit.page.body}`),
  }
}

function knowledgeResourceRef(
  page: KnowledgePage & { container: KnowledgeContainerRef; revision: number },
): RetrievalResourceRef {
  return {
    sourceId: SIGIL_KNOWLEDGE_RETRIEVAL_SOURCE_ID,
    kind: "knowledge-page",
    id: `${page.container.tier}:${encodeURIComponent(page.container.id)}/${encodeURIComponent(page.id)}`,
    revision: String(page.revision),
  }
}

function parseKnowledgeResource(
  resource: RetrievalResourceRef,
): { container: KnowledgeContainerRef; pageId: string } | undefined {
  if (
    resource.sourceId !== SIGIL_KNOWLEDGE_RETRIEVAL_SOURCE_ID ||
    resource.kind !== "knowledge-page"
  ) {
    return undefined
  }
  const match = /^(project|workspace):([^/]+)\/(.+)$/.exec(resource.id)
  if (!match) return undefined
  return {
    container: {
      tier: match[1] as KnowledgeContainerRef["tier"],
      id: decodeURIComponent(match[2] ?? ""),
    },
    pageId: decodeURIComponent(match[3] ?? ""),
  }
}

function formatKnowledgePointer(page: KnowledgePage & { revision?: number }): string {
  return formatInjectionBlock([
    {
      page,
      relevance: DEFAULT_PASSIVE_KNOWLEDGE_THRESHOLD,
    },
  ])
}

function activeKnowledgeContainer(
  principal: AuthenticatedPrincipal,
): KnowledgeContainerRef | undefined {
  const resourceScope =
    typeof principal.attributes?.sigilResourceScope === "string"
      ? principal.attributes.sigilResourceScope
      : undefined
  const parsedResourceScope = knowledgeContainerFromScope(resourceScope)
  if (parsedResourceScope) return parsedResourceScope

  const executionBinding =
    typeof principal.attributes?.sigilExecutionBinding === "string"
      ? principal.attributes.sigilExecutionBinding
      : undefined
  if (executionBinding) {
    try {
      const binding = JSON.parse(executionBinding) as Record<string, unknown>
      return knowledgeContainerFromScope(
        typeof binding.homeScopeId === "string" ? binding.homeScopeId : undefined,
      )
    } catch {
      return undefined
    }
  }
  return undefined
}

function knowledgeContainerFromScope(
  value: string | undefined,
): KnowledgeContainerRef | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const separator = trimmed.indexOf(":")
  if (separator <= 0) return undefined
  const tier = trimmed.slice(0, separator)
  const id = trimmed.slice(separator + 1).trim()
  if (!id) return undefined
  return tier === "project" || tier === "workspace" ? { tier, id } : undefined
}

function personaId(principal: AuthenticatedPrincipal): string | undefined {
  const value = principal.attributes?.sigilPersonaId
  return typeof value === "string" && value.trim() ? value : undefined
}

function validThreshold(value: number | undefined): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined
}

function relevanceTerms(text: string): string[] {
  return [...new Set(tokenize(text).filter((term) => term.length > 2))]
}

function absoluteRelevance(
  terms: readonly string[],
  hit: KnowledgeHit & { page: KnowledgePage },
): number {
  if (terms.length === 0) return 0
  const haystack = new Set(tokenize(`${hit.page.title} ${hit.page.body}`))
  const matched = terms.filter((term) => haystack.has(term)).length
  return matched / terms.length
}

function sameContainer(
  left: KnowledgeContainerRef,
  right: KnowledgeContainerRef,
): boolean {
  return left.tier === right.tier && left.id === right.id
}

function authContextForPrincipal(principal: AuthenticatedPrincipal): AuthContext {
  return {
    principal,
    authorize: async (request) => {
      if (
        request.action === "retrieval.source.discover" ||
        request.action === "retrieval.hit.read" ||
        request.action === "retrieval.content.resolve"
      ) {
        return { outcome: "allow", reason: "Sigil knowledge retrieval adapter" }
      }
      return { outcome: "deny", reason: "Sigil knowledge adapter only handles retrieval" }
    },
  }
}

function emptyFilterSchema() {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "sigil-chat",
      validate: (value: unknown) =>
        value === undefined || (isRecord(value) && Object.keys(value).length === 0)
          ? { value: undefined }
          : { issues: [{ message: "Expected an empty Sigil knowledge filter" }] },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?? []
}
