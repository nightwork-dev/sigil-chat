import type { AuthContext } from "@gonk/auth";
import {
  ScopedKnowledgeAccessError,
  type ScopedKnowledgeStore,
} from "@gonk/knowledge/scoped";
import type {
  KnowledgeContainerRef,
  KnowledgeHit,
  KnowledgePage,
} from "@gonk/knowledge/types";
import {
  canonicalResourceKey,
  RetrievalEvidenceCoordinator,
  type RetrievalEvidenceBudget,
  type RetrievalHit,
  type RetrievalEvidenceResult,
  type RetrievalResourceRef,
  type RetrievalSearchReceipt,
} from "@gonk/retrieval";
import { shape, type ToolRegistry } from "@gonk/tool-registry";
import { InMemorySearchStore, tokenize } from "@mirk/store/search";

import {
  getSessionArtifactStore,
  type SessionArtifactMetadata,
  type SessionArtifactStore,
} from "@workspace/artifact-store/repository";
import type { ResourceScope } from "@workspace/artifact-store/scope";
import {
  isResourceScope,
  isTextualFile,
  requireResourceScope,
  resourceScopeSchema,
} from "./files.js";
import { objectSchema, readHints } from "./domain-schemas.js";
import { isRecord } from "./validators.js";

const EVIDENCE_COLLECTION = "session-artifact-passages";
const ARTIFACT_SOURCE_ID = "sigil.artifacts";
const KNOWLEDGE_SOURCE_ID = "sigil.knowledge";
const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 8;
const MAX_PASSAGE_CHARS = 1_200;
const MIN_PASSAGE_BREAK_CHARS = 600;
const MAX_ARTIFACT_TEXT_CHARS = 250_000;
const MAX_CORPUS_TEXT_CHARS = 1_000_000;
const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export interface EvidenceAskInput {
  question: string;
  limit?: number;
  scope?: ResourceScope;
}

export interface EvidenceLocator {
  type: "text-offset";
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface ArtifactEvidenceCitation {
  citationId: string;
  source: "artifact";
  artifactId: string;
  filename: string;
  mediaType: string;
  quote: string;
  locator: EvidenceLocator;
  score: number;
  matchedTerms: string[];
}

export interface KnowledgeEvidenceCitation {
  citationId: string;
  source: "knowledge";
  pageId: string;
  title: string;
  container: KnowledgeContainerRef;
  revision: number;
  quote: string;
  score: number;
  matchedTerms: string[];
}

export type EvidenceCitation =
  | ArtifactEvidenceCitation
  | KnowledgeEvidenceCitation;

export interface SigilEvidenceCandidate {
  citation: EvidenceCitation;
  hit: RetrievalHit;
}

export interface SigilRetrievalEvidenceCoordinator {
  collect(input: {
    auth: AuthContext;
    question: string;
    resultLimit: number;
    candidates: readonly SigilEvidenceCandidate[];
  }): Promise<RetrievalEvidenceResult>;
}

export interface KnowledgeEvidenceDiagnostic {
  sourceId: typeof KNOWLEDGE_SOURCE_ID;
  outcome: "unqueried";
  reason: string;
  activeContainer: KnowledgeContainerRef;
}

interface EvidencePassageMeta extends Record<string, unknown> {
  artifactId: string;
  filename: string;
  mediaType: string;
  quote: string;
  locator: EvidenceLocator;
}

interface EvidenceCorpusSummary {
  artifactCount: number;
  textualArtifactCount: number;
  indexedPassageCount: number;
  truncatedArtifactIds: string[];
  corpusTruncated: boolean;
}

export interface EvidenceSearchResult {
  grounding: "grounded" | "no-evidence";
  question: string;
  citations: EvidenceCitation[];
  corpus: EvidenceCorpusSummary;
  evidenceReceipt?: {
    requestId: string;
    sources: string[];
    candidateCount: number;
    visibleResourceKeys: string[];
    selected: number;
    dropped: number;
    diagnostics?: KnowledgeEvidenceDiagnostic[];
  };
  answerInstruction: string;
}

export function registerEvidenceTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
  retrievalEvidenceCoordinator: SigilRetrievalEvidenceCoordinator =
    createSigilRetrievalEvidenceCoordinator(),
  scopedKnowledgeStore?: ScopedKnowledgeStore,
): void {
  registry.register({
    name: "sigil-evidence-ask",
    description:
      "Find BM25-ranked passages in the current session, workspace, project, or persona artifacts for a question. Returns structured citations with exact quotes and text offsets; when no passage matches, returns no-evidence and explicitly forbids invented citations.",
    visibility: "always",
    approval: "read",
    input: shape<EvidenceAskInput>(
      isEvidenceAskInput,
      "Expected a non-empty `question`, an optional integer `limit` from 1 to 8, and an optional `{ tier, id }` resource scope.",
    ),
    inputJsonSchema: objectSchema(
      {
        question: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: MAX_RESULT_LIMIT },
        scope: resourceScopeSchema(),
      },
      ["question"],
    ),
    hints: readHints,
    handler: async (input, ctx) => {
      const scope = requireResourceScope(input.scope, ctx);
      return {
        data: await searchArtifactEvidence({
          artifacts,
          retrievalEvidenceCoordinator,
          scopedKnowledgeStore,
          scope,
          auth: ctx.auth,
          question: input.question,
          limit: input.limit,
        }),
      };
    },
  });
}

export async function searchArtifactEvidence(input: {
  artifacts: SessionArtifactStore;
  retrievalEvidenceCoordinator?: SigilRetrievalEvidenceCoordinator;
  scopedKnowledgeStore?: ScopedKnowledgeStore;
  scope: ResourceScope;
  auth?: AuthContext;
  question: string;
  limit?: number;
}): Promise<EvidenceSearchResult> {
  if (!input.auth) {
    throw new Error("sigil-evidence-ask requires an authenticated tool context");
  }
  const question = input.question.trim();
  const artifacts = await input.artifacts.listByScope(
    input.scope,
    input.auth.principal,
  );
  const textualArtifacts = artifacts.filter(isTextualFile);
  const search = new InMemorySearchStore();
  const passages: Array<{
    id: string;
    fields: { title: string; body: string };
    meta: EvidencePassageMeta;
  }> = [];
  const truncatedArtifactIds: string[] = [];
  let remainingCorpusChars = MAX_CORPUS_TEXT_CHARS;
  let processedTextualArtifactCount = 0;

  for (const artifact of textualArtifacts) {
    if (remainingCorpusChars <= 0) break;
    const content = await input.artifacts.readContent(
      artifact.id,
      input.scope,
      input.auth.principal,
    );
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(
      content.bytes,
    );
    const allowedChars = Math.min(
      decoded.length,
      MAX_ARTIFACT_TEXT_CHARS,
      remainingCorpusChars,
    );
    const text = decoded.slice(0, allowedChars);
    if (allowedChars < decoded.length) truncatedArtifactIds.push(artifact.id);
    remainingCorpusChars -= allowedChars;
    passages.push(...passagesForArtifact(artifact, text));
    processedTextualArtifactCount += 1;
  }

  if (passages.length > 0) {
    search.indexMany(EVIDENCE_COLLECTION, passages);
  }
  const meaningfulTerms = [
    ...new Set(
      tokenize(question).filter((term) => !QUESTION_STOP_WORDS.has(term)),
    ),
  ];
  const searchQuery = meaningfulTerms.join(" ");
  const resultLimit = input.limit ?? DEFAULT_RESULT_LIMIT;
  const candidateHits = searchQuery
    ? search.search<EvidencePassageMeta>(EVIDENCE_COLLECTION, searchQuery, {
        limit: Math.max(resultLimit * 4, 20),
        fieldWeights: { title: 2, body: 1 },
      })
    : [];
  const minimumTermMatches = Math.min(2, meaningfulTerms.length);
  const hits = candidateHits
    .map((hit) => {
      const passageTerms = new Set(
        tokenize(`${hit.meta.filename} ${hit.meta.quote}`),
      );
      return {
        hit,
        matchedTerms: meaningfulTerms.filter((term) => passageTerms.has(term)),
      };
    })
    .filter(({ matchedTerms }) => matchedTerms.length >= minimumTermMatches)
    .slice(0, resultLimit);
  const artifactCandidates = hits.map(({ hit, matchedTerms }) => ({
    citation: {
      citationId: "",
      source: "artifact" as const,
      artifactId: hit.meta.artifactId,
      filename: hit.meta.filename,
      mediaType: hit.meta.mediaType,
      quote: hit.meta.quote,
      locator: hit.meta.locator,
      score: hit.score,
      matchedTerms,
    },
    hit: retrievalHitForArtifact(hit, matchedTerms),
  }));
  const knowledge = await knowledgeCandidatesForScope({
    scopedKnowledgeStore: input.scopedKnowledgeStore,
    auth: input.auth,
    scope: input.scope,
    question,
    limit: Math.max(resultLimit * 4, 20),
    meaningfulTerms,
  });
  const coordinated =
    await (input.retrievalEvidenceCoordinator ??
      createSigilRetrievalEvidenceCoordinator()).collect({
      candidates: [...artifactCandidates, ...knowledge.candidates],
      auth: input.auth,
      question,
      resultLimit,
    });
  const citationByResourceKey = new Map(
    [...artifactCandidates, ...knowledge.candidates].map((candidate) => [
      canonicalResourceKey(candidate.hit.resource),
      candidate.citation,
    ]),
  );
  const citations = coordinated.packets.flatMap((packet, index) => {
    const citation = citationByResourceKey.get(packet.resourceKey);
    return citation ? [{ ...citation, citationId: `c${index + 1}` }] : [];
  });
  const corpus: EvidenceCorpusSummary = {
    artifactCount: artifacts.length,
    textualArtifactCount: textualArtifacts.length,
    indexedPassageCount: passages.length,
    truncatedArtifactIds,
    corpusTruncated:
      processedTextualArtifactCount < textualArtifacts.length ||
      truncatedArtifactIds.length > 0,
  };
  const evidenceReceipt = {
    requestId: coordinated.receipt.requestId,
    sources: coordinated.receipt.contributors.map(
      (contributor) => contributor.sourceId,
    ),
    candidateCount: coordinated.receipt.candidateCount,
    visibleResourceKeys: coordinated.receipt.search.visibleHits.map(
      (hit) => hit.resourceKey,
    ),
    selected: coordinated.receipt.selected.length,
    dropped: coordinated.receipt.dropped.length,
    ...(knowledge.diagnostic
      ? { diagnostics: [knowledge.diagnostic] }
      : {}),
  };

  if (citations.length === 0) {
    return {
      grounding: "no-evidence",
      question,
      citations: [],
      corpus,
      evidenceReceipt,
      answerInstruction:
        "No supporting passage was found in the selected artifact scope. Say that the available evidence does not answer the question; do not invent an answer, quote, locator, or citation.",
    };
  }

  return {
    grounding: "grounded",
    question,
    citations,
    corpus,
    evidenceReceipt,
    answerInstruction:
      "Answer only from these passages. Cite claims with the returned citationId values and preserve each quote, source identifier, and locator exactly as supplied.",
  };
}

async function knowledgeCandidatesForScope(input: {
  scopedKnowledgeStore: ScopedKnowledgeStore | undefined;
  auth: AuthContext;
  scope: ResourceScope;
  question: string;
  limit: number;
  meaningfulTerms: readonly string[];
}): Promise<{
  candidates: SigilEvidenceCandidate[];
  diagnostic?: KnowledgeEvidenceDiagnostic;
}> {
  if (!input.scopedKnowledgeStore) return { candidates: [] };
  const activeContainer = knowledgeContainerForScope(input.scope);
  if (!activeContainer) return { candidates: [] };
  const principalId = input.auth.principal?.id;
  if (!principalId) return { candidates: [] };
  try {
    const result = await input.scopedKnowledgeStore.query({
      principal: { principalId },
      activeContainer,
      text: input.question,
      limit: input.limit,
    });
    return {
      candidates: result.results.map((hit) =>
        evidenceCandidateForKnowledge(hit, input.meaningfulTerms),
      ),
    };
  } catch (error) {
    if (error instanceof ScopedKnowledgeAccessError) {
      return {
        candidates: [],
        diagnostic: {
          sourceId: KNOWLEDGE_SOURCE_ID,
          outcome: "unqueried",
          reason: "scoped knowledge read denied for active container",
          activeContainer,
        },
      };
    }
    throw error;
  }
}

function knowledgeContainerForScope(
  scope: ResourceScope,
): KnowledgeContainerRef | undefined {
  return scope.tier === "project" || scope.tier === "workspace"
    ? { tier: scope.tier, id: scope.id }
    : undefined;
}

function evidenceCandidateForKnowledge(
  hit: KnowledgeHit & { page: KnowledgePage & { container: KnowledgeContainerRef; revision: number } },
  meaningfulTerms: readonly string[],
): SigilEvidenceCandidate {
  const matchedTerms = knowledgeMatchedTerms(hit.page, meaningfulTerms);
  const quote = truncateQuote(hit.page.body);
  return {
    citation: {
      citationId: "",
      source: "knowledge",
      pageId: hit.page.id,
      title: hit.page.title,
      container: hit.page.container,
      revision: hit.page.revision,
      quote,
      score: hit.score,
      matchedTerms,
    },
    hit: retrievalHit({
      resource: {
        sourceId: KNOWLEDGE_SOURCE_ID,
        kind: "knowledge-page",
        id: `${hit.page.container.tier}:${hit.page.container.id}/${hit.page.id}`,
        revision: String(hit.page.revision),
      },
      sourceId: KNOWLEDGE_SOURCE_ID,
      score: hit.score,
      matchedTerms,
    }),
  };
}

function knowledgeMatchedTerms(
  page: Pick<KnowledgePage, "title" | "body">,
  meaningfulTerms: readonly string[],
): string[] {
  const pageTerms = new Set(tokenize(`${page.title} ${page.body}`));
  return meaningfulTerms.filter((term) => pageTerms.has(term));
}

function truncateQuote(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= MAX_PASSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_PASSAGE_CHARS - 1).trimEnd()}…`;
}

export function createSigilRetrievalEvidenceCoordinator(): SigilRetrievalEvidenceCoordinator {
  return {
    collect: async (input) => {
      const hits: RetrievalHit[] = [];
      for (const candidate of input.candidates) {
        if (await authorizeRetrievalHit(input.auth, candidate.hit)) {
          hits.push(candidate.hit);
        }
      }
      const coordinator = new RetrievalEvidenceCoordinator({
        engine: {
          search: async (request) => ({
            hits,
            receipt: retrievalSearchReceipt({
              requestId: request.requestId,
              hits,
            }),
          }),
        },
      });
      return coordinator.collect({
        requestId: crypto.randomUUID(),
        auth: input.auth,
        text: input.question,
        mode: "lexical",
        purpose: "user-search",
        maxPackets: input.resultLimit,
        candidateLimit: Math.max(input.resultLimit * 4, 20),
        estimateTokens: estimateEvidenceTokens,
      });
    },
  };
}

async function authorizeRetrievalHit(
  auth: AuthContext,
  hit: RetrievalHit,
): Promise<boolean> {
  const decision = await auth.authorize({
    action: "retrieval.hit.read",
    resource: {
      kind: "retrieval-resource",
      target: canonicalResourceKey(hit.resource),
      scope: "resource",
      metadata: {
        sourceId: hit.resource.sourceId,
        resourceKind: hit.resource.kind,
        revision: hit.resource.revision,
        audience: hit.audience,
      },
    },
  });
  return decision.outcome === "allow";
}

function retrievalHitForArtifact(
  hit: { id: string; score: number; meta: EvidencePassageMeta },
  matchedTerms: readonly string[],
): RetrievalHit {
  return retrievalHit({
    resource: {
      sourceId: ARTIFACT_SOURCE_ID,
      kind: "artifact-passage",
      id: hit.id,
      revision: hit.meta.artifactId,
      fragment: {
        kind: "range",
        id: hit.meta.artifactId,
        start: hit.meta.locator.startOffset,
        end: hit.meta.locator.endOffset,
      },
    },
    sourceId: ARTIFACT_SOURCE_ID,
    score: hit.score,
    matchedTerms,
  });
}

function retrievalHit(input: {
  resource: RetrievalResourceRef;
  sourceId: string;
  score: number;
  matchedTerms: readonly string[];
}): RetrievalHit {
  const score = Number.isFinite(input.score) ? input.score : 0;
  return {
    resource: input.resource,
    audience: "restricted",
    scores: {
      lexical: {
        algorithm: "bm25",
        sourceId: input.sourceId,
        value: score,
      },
      sourcePriority: 50,
      final: score,
    },
    matchedTerms: input.matchedTerms,
  };
}

function retrievalSearchReceipt(input: {
  requestId: string;
  hits: readonly RetrievalHit[];
}): RetrievalSearchReceipt {
  const sourceIds = [...new Set(input.hits.map((hit) => hit.resource.sourceId))];
  return {
    kind: "retrieval-search",
    receiptVersion: 1,
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
    mode: "lexical",
    purpose: "user-search",
    outcome: "success",
    sources: sourceIds.map((sourceId) => ({
      sourceId,
      mode: "native-index",
    })),
    visibleHits: input.hits.map((hit) => ({
      resourceKey: canonicalResourceKey(hit.resource),
      sourceId: hit.resource.sourceId,
      scores: hit.scores,
    })),
    drops: [],
  };
}

function estimateEvidenceTokens(hit: RetrievalHit): RetrievalEvidenceBudget {
  return {
    estimatedTokens: Math.max(
      1,
      Math.ceil(JSON.stringify(hit.resource).length / 4),
    ),
    estimateQuality: "fallback",
  };
}

function passagesForArtifact(
  artifact: SessionArtifactMetadata,
  text: string,
): Array<{
  id: string;
  fields: { title: string; body: string };
  meta: EvidencePassageMeta;
}> {
  const passages = splitPassages(text);
  return passages.map((passage, index) => ({
    id: `${artifact.id}#passage-${index + 1}`,
    fields: { title: artifact.filename, body: passage.quote },
    meta: {
      artifactId: artifact.id,
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      quote: passage.quote,
      locator: passage.locator,
    },
  }));
}

export function splitPassages(text: string): Array<{
  quote: string;
  locator: EvidenceLocator;
}> {
  const passages: Array<{ quote: string; locator: EvidenceLocator }> = [];
  let start = 0;
  let currentLine = 1;

  while (start < text.length) {
    while (start < text.length && /\s/.test(text[start] ?? "")) {
      if (text.charCodeAt(start) === 10) currentLine += 1;
      start += 1;
    }
    if (start >= text.length) break;

    const hardEnd = Math.min(start + MAX_PASSAGE_CHARS, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      end = preferredBreak(text, start, hardEnd);
    }
    while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
    if (end <= start) end = hardEnd;

    const quote = text.slice(start, end);
    const startLine = currentLine;
    const endLine = startLine + countNewlines(quote);
    passages.push({
      quote,
      locator: {
        type: "text-offset",
        startOffset: start,
        endOffset: end,
        startLine,
        endLine,
      },
    });
    currentLine = endLine;
    start = end;
  }

  return passages;
}

function preferredBreak(text: string, start: number, hardEnd: number): number {
  const minimum = start + MIN_PASSAGE_BREAK_CHARS;
  for (const marker of ["\n\n", "\n", ". ", " "]) {
    const found = text.lastIndexOf(marker, hardEnd);
    if (found >= minimum) return found + (marker === ". " ? 1 : 0);
  }
  return hardEnd;
}

function countNewlines(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === "\n") count += 1;
  }
  return count;
}

function isEvidenceAskInput(value: unknown): value is EvidenceAskInput {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      ["question", "limit", "scope"].includes(key),
    ) &&
    typeof value.question === "string" &&
    value.question.trim().length > 0 &&
    (value.limit === undefined ||
      (Number.isInteger(value.limit) &&
        Number(value.limit) >= 1 &&
        Number(value.limit) <= MAX_RESULT_LIMIT)) &&
    (value.scope === undefined || isResourceScope(value.scope))
  );
}
