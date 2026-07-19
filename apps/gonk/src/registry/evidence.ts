import type { AuthenticatedPrincipal } from "@gonk/auth";
import {
  shape,
  type ToolContext,
  type ToolRegistry,
} from "@gonk/tool-registry";
import { InMemorySearchStore, tokenize } from "@mirk/store/search";

import {
  getSessionArtifactStore,
  type SessionArtifactMetadata,
  type SessionArtifactStore,
} from "../artifact-store.js";
import type { ResourceScope } from "../artifact-scope.js";
import {
  isResourceScope,
  isTextualFile,
  requireResourceScope,
  resourceScopeSchema,
} from "./files.js";
import { objectSchema, readHints } from "./schemas.js";
import { isRecord } from "./validators.js";

const EVIDENCE_COLLECTION = "session-artifact-passages";
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

export interface EvidenceCitation {
  citationId: string;
  artifactId: string;
  filename: string;
  mediaType: string;
  quote: string;
  locator: EvidenceLocator;
  score: number;
  matchedTerms: string[];
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
  answerInstruction: string;
}

export function registerEvidenceTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
): void {
  registry.register({
    name: "sigil-evidence-ask",
    description:
      "Find BM25-ranked passages in the current session, project, or persona artifacts for a question. Returns structured citations with exact quotes and text offsets; when no passage matches, returns no-evidence and explicitly forbids invented citations.",
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
          scope,
          principal: ctx.auth?.principal,
          question: input.question,
          limit: input.limit,
        }),
      };
    },
  });
}

export async function searchArtifactEvidence(input: {
  artifacts: SessionArtifactStore;
  scope: ResourceScope;
  principal?: AuthenticatedPrincipal;
  question: string;
  limit?: number;
}): Promise<EvidenceSearchResult> {
  const question = input.question.trim();
  const artifacts = await input.artifacts.listByScope(
    input.scope,
    input.principal,
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
      input.principal,
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
  const citations = hits.map(
    ({ hit, matchedTerms }, index): EvidenceCitation => ({
      citationId: `c${index + 1}`,
      artifactId: hit.meta.artifactId,
      filename: hit.meta.filename,
      mediaType: hit.meta.mediaType,
      quote: hit.meta.quote,
      locator: hit.meta.locator,
      score: hit.score,
      matchedTerms,
    }),
  );
  const corpus: EvidenceCorpusSummary = {
    artifactCount: artifacts.length,
    textualArtifactCount: textualArtifacts.length,
    indexedPassageCount: passages.length,
    truncatedArtifactIds,
    corpusTruncated:
      processedTextualArtifactCount < textualArtifacts.length ||
      truncatedArtifactIds.length > 0,
  };

  if (citations.length === 0) {
    return {
      grounding: "no-evidence",
      question,
      citations: [],
      corpus,
      answerInstruction:
        "No supporting passage was found in the selected artifact scope. Say that the available artifacts do not answer the question; do not invent an answer, quote, locator, or citation.",
    };
  }

  return {
    grounding: "grounded",
    question,
    citations,
    corpus,
    answerInstruction:
      "Answer only from these passages. Cite claims with the returned citationId values and preserve each quote, artifactId, and locator exactly as supplied.",
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
