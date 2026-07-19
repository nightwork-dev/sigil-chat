import {
  ContextCompiler,
  ContextContributorRegistry,
  type ContextCandidate,
  type ContextCompileResult,
  type ContextContributor,
  type ContextTokenCounter,
  fallbackTokenCounter,
  type ResolvedContextCandidate,
} from "@gonk/context"
import type {
  AuthClaimRecord,
  AuthContext,
  AuthenticatedPrincipal,
  AuthorizationRequest,
  AuthorizationDecision,
} from "@gonk/auth"
import type {
  ManagedSkillDetail,
  ManagedSkillRegistry,
  ManagedSkillSummary,
} from "@gonk/skills"
import { FilesystemManagedSkillRegistry } from "@gonk/skills"
import {
  canonicalResourceKey,
  type RetrievalEngine,
  type RetrievalResourceRef,
  type RetrievalHit,
} from "@gonk/retrieval"
import type { UserContent } from "ai"
import type { EveMessageContext, EveMessageResult } from "eve/channels/eve"

type EveSessionAuth = NonNullable<EveMessageContext["eve"]["caller"]>

const DEFAULT_MAX_CONTEXT_TOKENS = 12_000
const SKILL_CONTEXT_CONTRIBUTOR_ID = "sigil.skills"
const RETRIEVAL_CONTEXT_CONTRIBUTOR_ID = "sigil.retrieval"

export interface SigilContextOptions {
  compiler?: ContextCompiler
  createCompiler?: (auth: AuthContext) => ContextCompiler
  maxTokens?: number
  model?: string
  requestedContributorIds?: readonly string[]
  pinnedResourceKeys?: readonly string[]
  /**
   * Reads the session's shared blackboard (S3.2). When provided, the current
   * session's blackboard content is injected into every turn's context so a
   * user edit is visible to the agent on the very next turn (and vice-versa via
   * the sigil-blackboard-write tool). Best-effort: a read failure never blocks
   * a turn. Session is resolved from the caller's resource scope.
   */
  readBlackboard?: (sessionId: string) => Promise<string>
}

export function createSigilEveOnMessage(options: SigilContextOptions) {
  return async (
    ctx: EveMessageContext,
    message: string | UserContent,
  ): Promise<EveMessageResult> => {
    const auth = toGonkAuthContext(ctx.eve.caller)
    if (auth === null) return null

    const compiler =
      options.createCompiler?.(auth) ??
      options.compiler ??
      createDefaultSigilContextCompiler()

    const compiled = await compileSigilContextForMessage({
      auth,
      compiler,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      message,
      model: options.model,
      pinnedResourceKeys: options.pinnedResourceKeys,
      requestedContributorIds: options.requestedContributorIds,
    })

    if (compiled.status === "blocked") {
      return null
    }

    const blocks: string[] = []
    const compiledContent = compiled.content.trim()
    if (compiledContent.length > 0) blocks.push(compiledContent)

    // S3.2: inject the session's shared blackboard every turn so a user (or
    // agent) edit is visible to the other party on the next turn. Best-effort —
    // never let a blackboard read block a turn.
    if (options.readBlackboard) {
      const sessionId = sessionIdFromScope(
        readScopeAttribute(ctx.eve.caller),
      )
      if (sessionId !== null) {
        try {
          const blackboard = (await options.readBlackboard(sessionId)).trim()
          if (blackboard.length > 0) {
            blocks.push(
              `## Shared blackboard (session scratch space)\n` +
                `A scratch space you and the user both edit; it persists across ` +
                `the session. Update it with the sigil-blackboard-write tool. ` +
                `Current contents:\n\n${blackboard}`,
            )
          }
        } catch {
          // Blackboard context is best-effort; a read failure is not fatal.
        }
      }
    }

    return {
      auth: ctx.eve.caller,
      context: blocks.length > 0 ? blocks : undefined,
    }
  }
}

/** Only session-tier scopes have a blackboard; project/persona scopes do not. */
function sessionIdFromScope(scope: string | undefined): string | null {
  if (scope === undefined) return null
  const trimmed = scope.trim()
  if (trimmed.length === 0) return null
  const separator = trimmed.indexOf(":")
  if (separator < 0) return trimmed // legacy bare id = session scope
  const id = trimmed.slice(separator + 1).trim()
  return trimmed.slice(0, separator) === "session" && id.length > 0 ? id : null
}

function readScopeAttribute(
  caller: EveMessageContext["eve"]["caller"],
): string | undefined {
  const value = caller?.attributes.sigilResourceScope
  return typeof value === "string" ? value : undefined
}

export async function compileSigilContextForMessage(input: {
  auth: AuthContext
  compiler: ContextCompiler
  maxTokens: number
  message: string | UserContent
  model?: string
  requestedContributorIds?: readonly string[]
  pinnedResourceKeys?: readonly string[]
}): Promise<ContextCompileResult> {
  return input.compiler.compile({
    requestId: crypto.randomUUID(),
    auth: input.auth,
    audience: "model",
    maxTokens: input.maxTokens,
    query: messageToQuery(input.message),
    model: input.model,
    requestedContributorIds: input.requestedContributorIds,
    pinnedResourceKeys: input.pinnedResourceKeys,
  })
}

export function createDefaultSigilContextCompiler(options?: {
  agentProjectRoot?: string
  requiredSkillIds?: readonly string[]
  tokenCounter?: ContextTokenCounter
}) {
  const registry = new ContextContributorRegistry()
  const agentProjectRoot =
    options?.agentProjectRoot ?? new URL("..", import.meta.url).pathname
  registry.register(
    createSkillContextContributor({
      registry: new FilesystemManagedSkillRegistry({
        env: {
          cwd: agentProjectRoot,
          projectRoot: agentProjectRoot,
          homeRoot: `${agentProjectRoot}/.sigil-context-home`,
          rootKinds: ["agents", ".agents", ".gonk"],
        },
      }),
      requiredSkillIds: options?.requiredSkillIds,
    }),
  )
  return new ContextCompiler({
    registry,
    tokenCounter: options?.tokenCounter ?? fallbackTokenCounter,
    configVersion: "sigil-chat-agent-context-v1",
  })
}

export function createSkillContextContributor(options: {
  registry: ManagedSkillRegistry
  requiredSkillIds?: readonly string[]
}): ContextContributor {
  const requiredSkillIds = new Set(options.requiredSkillIds ?? [])

  return {
    id: SKILL_CONTEXT_CONTRIBUTOR_ID,
    async discover(request) {
      let skills: readonly ManagedSkillSummary[] = []
      try {
        const result = await options.registry.list()
        skills = result.skills
      } catch {
        skills = []
      }

      const byId = new Map(skills.map((skill) => [skill.id, skill]))
      const required = [...requiredSkillIds].map((skillId) =>
        skillSummaryToCandidate(
          byId.get(skillId) ?? requiredSkillPlaceholder(skillId),
          true,
        ),
      )
      const matched = skills
        .filter(
          (skill) =>
            !requiredSkillIds.has(skill.id) &&
            skillMatchesQuery(skill, request.query),
        )
        .map((skill) => skillSummaryToCandidate(skill, false))

      return [...required, ...matched]
    },
    async resolve(request) {
      const skillId = skillIdFromResourceKey(request.candidate.resourceKey)
      if (skillId === null) return null

      const result = await options.registry.get({ id: skillId })
      if (result.status !== "found") return null

      return skillDetailToResolvedCandidate(request.candidate, result.skill)
    },
  }
}

export function createRetrievalContextContributor(options: {
  engine: Pick<RetrievalEngine, "search" | "resolve">
  authForRequestId: (requestId: string) => AuthContext | undefined
  limit?: number
}): ContextContributor {
  return {
    id: RETRIEVAL_CONTEXT_CONTRIBUTOR_ID,
    async discover(request) {
      if (request.query === undefined || request.query.trim().length === 0) {
        return []
      }
      const auth = options.authForRequestId(request.requestId)
      if (auth === undefined) throw new Error("Missing request auth")

      const result = await options.engine.search({
        requestId: request.requestId,
        auth,
        text: request.query,
        mode: "lexical",
        limit: options.limit ?? 5,
        purpose: "agent-recall",
      })

      return result.hits.map(retrievalHitToCandidate)
    },
    async resolve(request) {
      const hit = retrievalResourceFromCandidate(request.candidate)
      if (hit === null) return null
      const auth = options.authForRequestId(request.requestId)
      if (auth === undefined) return null

      const result = await options.engine.resolve({
        requestId: request.requestId,
        auth,
        resource: hit,
      })

      if (result.status !== "resolved") return null

      return {
        candidateId: request.candidate.candidateId,
        contributorId: request.candidate.contributorId,
        resourceKey: request.candidate.resourceKey,
        revision: result.value.resource.revision,
        necessity: request.candidate.necessity,
        priority: request.candidate.priority,
        audience: request.audience,
        content: `Retrieved context: ${result.value.label}\n${result.value.content}`,
        resource: {
          kind: "retrieval-resource",
          target: request.candidate.resourceKey,
          tenantId: result.value.tenantId,
          workspaceId: result.value.workspaceId,
          metadata: { sourceId: result.value.resource.sourceId },
        },
      }
    },
  }
}

export function toGonkAuthContext(
  auth: EveMessageContext["eve"]["caller"],
): AuthContext | null {
  if (auth === null) return null
  const kind = principalKind(auth.principalType)
  if (kind === null) return null
  const tenantId = trustedClaim(
    auth.attributes.sigilTenantId ?? auth.attributes.tenantId,
  )
  const workspaceId = trustedClaim(
    auth.attributes.sigilWorkspaceId ?? auth.attributes.workspaceId,
  )

  const principal: AuthenticatedPrincipal = {
    id: auth.principalId,
    kind,
    identity: {
      issuer: auth.issuer ?? auth.authenticator,
      subject: auth.subject ?? auth.principalId,
      method: auth.authenticator === "local-dev" ? "local" : "session",
    },
    roles: asStringList(auth.attributes.roles),
    scopes: asStringList(auth.attributes.scopes),
    attributes: copyAuthAttributes(auth.attributes),
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
  }

  return authContextForPrincipal(principal)
}

function authContextForPrincipal(principal: AuthenticatedPrincipal): AuthContext {
  return {
    principal,
    authorize: (request: AuthorizationRequest) =>
      authorizeSigilContextRequest(principal, request),
  }
}

function authorizeSigilContextRequest(
  principal: AuthenticatedPrincipal,
  request: AuthorizationRequest,
): AuthorizationDecision {
  const deniedTargets = asAuthClaimStringList(principal.attributes?.sigilContextDeny)
  if (
    request.resource.target !== undefined &&
    deniedTargets.includes(request.resource.target)
  ) {
    return { outcome: "deny", reason: "Context resource denied by server auth." }
  }

  const allowedActions = new Set([
    "context.discover",
    "context.use",
    "skill.discover",
    "skill.read",
    "retrieval.source.discover",
    "retrieval.hit.read",
    "retrieval.content.resolve",
  ])

  if (!allowedActions.has(request.action)) {
    return { outcome: "deny", reason: "Action is outside Sigil context use." }
  }

  if (!resourceMatchesPrincipalBinding(principal, request.resource)) {
    return {
      outcome: "deny",
      reason: "Context resource is outside the principal binding.",
    }
  }

  if (
    principal.kind === "local" ||
    principal.kind === "human" ||
    principal.kind === "service" ||
    principal.kind === "agent"
  ) {
    return { outcome: "allow", reason: "Authenticated Sigil context request." }
  }

  return { outcome: "deny", reason: "Anonymous context use is not allowed." }
}

function skillSummaryToCandidate(
  skill: ManagedSkillSummary,
  required: boolean,
): ContextCandidate {
  return {
    candidateId: `skill:${skill.id}:${skill.revision}`,
    contributorId: SKILL_CONTEXT_CONTRIBUTOR_ID,
    resourceKey: `skill:${skill.id}`,
    revisionHint: skill.revision,
    necessity: required ? "required" : "optional",
    priority: skill.pinned === true ? 80 : 50,
    estimatedTokens: estimateTokens(
      [skill.name, skill.description, skill.id].filter(Boolean).join("\n"),
    ),
    estimateQuality: "fallback",
  }
}

function requiredSkillPlaceholder(skillId: string): ManagedSkillSummary {
  return {
    id: skillId,
    description: `Required skill ${skillId}`,
    origin: { kind: "workspace", adapterId: "sigil-required-skill" },
    scope: "project",
    lifecycle: "active",
    capabilities: ["read", "activate"],
    revision: `required:${skillId}`,
    contentHash: `required:${skillId}`,
  }
}

function skillMatchesQuery(skill: ManagedSkillSummary, query: string | undefined) {
  if (query === undefined) return false
  const normalizedQuery = query.toLowerCase()
  const terms = [skill.id, skill.name, skill.description]
    .filter((term): term is string => typeof term === "string")
    .map((term) => term.toLowerCase())

  return terms.some(
    (term) =>
      normalizedQuery.includes(`@${term}`) || normalizedQuery.includes(term),
  )
}

function skillDetailToResolvedCandidate(
  candidate: ContextCandidate,
  skill: ManagedSkillDetail,
): ResolvedContextCandidate {
  return {
    candidateId: candidate.candidateId,
    contributorId: candidate.contributorId,
    resourceKey: candidate.resourceKey,
    revision: skill.revision,
    necessity: candidate.necessity,
    priority: candidate.priority,
    audience: "model",
    content: `Managed skill: ${skill.id}\nDescription: ${skill.description}\n\n${skill.body.trim()}`,
    resource: {
      kind: "skill",
      target: candidate.resourceKey,
      scope: skill.scope,
      metadata: { contentHash: skill.contentHash },
    },
  }
}

function retrievalHitToCandidate(hit: RetrievalHit): ContextCandidate {
  const resourceKey = canonicalResourceKey(hit.resource)
  return {
    candidateId: `retrieval:${resourceKey}`,
    contributorId: RETRIEVAL_CONTEXT_CONTRIBUTOR_ID,
    resourceKey,
    revisionHint: hit.resource.revision,
    necessity: "optional",
    priority: Math.max(1, Math.round(hit.scores.final * 100)),
    estimatedTokens: 500,
    estimateQuality: "fallback",
  }
}

function retrievalResourceFromCandidate(
  candidate: ContextCandidate,
): RetrievalResourceRef | null {
  try {
    const [sourceId, kind, id, revision, fragment] = JSON.parse(
      candidate.resourceKey,
    ) as [string, string, string, string, unknown]
    return {
      sourceId,
      kind,
      id,
      revision,
      ...(fragment === null ? {} : { fragment: fragment as RetrievalResourceRef["fragment"] }),
    }
  } catch {
    return null
  }
}

function messageToQuery(message: string | UserContent): string {
  if (typeof message === "string") return message
  return message
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}

function skillIdFromResourceKey(resourceKey: string): string | null {
  return resourceKey.startsWith("skill:") ? resourceKey.slice("skill:".length) : null
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4))
}

function principalKind(
  value: EveSessionAuth["principalType"],
): AuthenticatedPrincipal["kind"] | null {
  if (value === "local-dev") return "local"
  if (value === "user" || value === "human") return "human"
  if (value === "agent") return "agent"
  if (value === "service" || value === "runtime") return "service"
  return null
}

function asStringList(value: string | readonly string[] | undefined) {
  if (Array.isArray(value)) return [...value]
  if (typeof value === "string" && value.length > 0) return [value]
  return []
}

function asAuthClaimStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []))
  }
  return typeof value === "string" && value.length > 0 ? [value] : []
}

function trustedClaim(value: string | readonly string[] | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function resourceMatchesPrincipalBinding(
  principal: AuthenticatedPrincipal,
  resource: AuthorizationRequest["resource"],
) {
  if (
    resource.tenantId !== undefined &&
    (principal.tenantId === undefined || resource.tenantId !== principal.tenantId)
  ) {
    return false
  }
  if (
    resource.workspaceId !== undefined &&
    (principal.workspaceId === undefined ||
      resource.workspaceId !== principal.workspaceId)
  ) {
    return false
  }
  return true
}

function copyAuthAttributes(
  attributes: Readonly<Record<string, string | readonly string[]>>,
): AuthClaimRecord {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]),
  )
}
