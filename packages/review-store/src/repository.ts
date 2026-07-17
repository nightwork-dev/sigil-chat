import {
  isRecord,
  JsonFileStore,
  resolveWorkspaceDataPath,
} from "@workspace/file-store-core";

import { createDraftArticleReviewDocument } from "./sample.js";
import type {
  ReviewAnnotation,
  ReviewAcceptanceInput,
  ReviewDocument,
  ReviewMutationResult,
  ReviewPassageEdit,
  ReviewUpdateResult,
} from "./types.js";

export interface ReviewRepository {
  get(): Promise<ReviewDocument>;
  updatePassages(
    edits: ReviewPassageEdit[],
    expectedRevision?: number,
  ): Promise<ReviewUpdateResult>;
  addAnnotations(
    annotations: Array<
      Pick<ReviewAnnotation, "passageIds" | "kind" | "body" | "author"> & {
        id?: string;
      }
    >,
    expectedRevision?: number,
  ): Promise<{ document: ReviewDocument; annotations: ReviewAnnotation[] }>;
  resolveAnnotation(
    id: string,
    resolution: "dismissed" | "converted",
    resolutionNote: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult>;
  lockDecision(
    id: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult>;
  setAcceptanceCheck(
    id: string,
    checked: boolean,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult>;
  acceptRevision(
    input: ReviewAcceptanceInput,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult>;
}

export class MemoryReviewRepository implements ReviewRepository {
  private document: ReviewDocument;
  private nextAnnotation = 1;
  private readonly now: () => string;

  constructor(options?: { document?: ReviewDocument; now?: () => string }) {
    this.document = structuredClone(
      options?.document ?? createDraftArticleReviewDocument(),
    );
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  async get(): Promise<ReviewDocument> {
    return structuredClone(this.document);
  }

  async updatePassages(
    edits: ReviewPassageEdit[],
    expectedRevision?: number,
  ): Promise<ReviewUpdateResult> {
    const result = applyPassageEdits(this.document, edits, expectedRevision);
    if (result.applied) this.document = result.document;
    return structuredClone(result);
  }

  async addAnnotations(
    annotations: Parameters<ReviewRepository["addAnnotations"]>[0],
    expectedRevision?: number,
  ): Promise<{ document: ReviewDocument; annotations: ReviewAnnotation[] }> {
    assertRevision(this.document, expectedRevision);
    const result = addAnnotations(
      this.document,
      annotations,
      this.now,
      () => `agent-annotation-${this.nextAnnotation++}`,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async resolveAnnotation(
    id: string,
    resolution: "dismissed" | "converted",
    resolutionNote: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    const result = resolveAnnotation(
      this.document,
      id,
      resolution,
      resolutionNote,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async lockDecision(
    id: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    const result = lockDecision(this.document, id, this.now, expectedRevision);
    this.document = result.document;
    return structuredClone(result);
  }

  async setAcceptanceCheck(
    id: string,
    checked: boolean,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    const result = setAcceptanceCheck(
      this.document,
      id,
      checked,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async acceptRevision(
    input: ReviewAcceptanceInput,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    const result = acceptRevision(
      this.document,
      input,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }
}

export class FileReviewRepository implements ReviewRepository {
  private readonly store: JsonFileStore<ReviewDocument>;

  constructor(
    readonly filePath = resolveReviewStorePath(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.store = new JsonFileStore({
      filePath,
      lockLabel: "review",
      createInitial: createDraftArticleReviewDocument,
      parse: parseReviewDocument,
      corruptError: (path) =>
        new Error(
          `Review store is corrupt at "${path}". Expected a review document with valid outline, passages, decisions, annotations, acceptance, and history arrays.`,
        ),
    });
  }

  async get(): Promise<ReviewDocument> {
    return this.read();
  }

  async updatePassages(
    edits: ReviewPassageEdit[],
    expectedRevision?: number,
  ): Promise<ReviewUpdateResult> {
    return this.withWriteLock(async () => {
      const document = await this.read();
      const result = applyPassageEdits(document, edits, expectedRevision);
      if (result.applied) await this.write(result.document);
      return structuredClone(result);
    });
  }

  async addAnnotations(
    annotations: Parameters<ReviewRepository["addAnnotations"]>[0],
    expectedRevision?: number,
  ): Promise<{ document: ReviewDocument; annotations: ReviewAnnotation[] }> {
    return this.withWriteLock(async () => {
      const document = await this.read();
      assertRevision(document, expectedRevision);
      let sequence = document.annotations.length + 1;
      const result = addAnnotations(
        document,
        annotations,
        this.now,
        () => `agent-annotation-${sequence++}`,
      );
      await this.write(result.document);
      return structuredClone(result);
    });
  }

  async resolveAnnotation(
    id: string,
    resolution: "dismissed" | "converted",
    resolutionNote: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    return this.mutate((document) =>
      resolveAnnotation(
        document,
        id,
        resolution,
        resolutionNote,
        this.now,
        expectedRevision,
      ),
    );
  }

  async lockDecision(
    id: string,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    return this.mutate((document) =>
      lockDecision(document, id, this.now, expectedRevision),
    );
  }

  async setAcceptanceCheck(
    id: string,
    checked: boolean,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    return this.mutate((document) =>
      setAcceptanceCheck(document, id, checked, this.now, expectedRevision),
    );
  }

  async acceptRevision(
    input: ReviewAcceptanceInput,
    expectedRevision?: number,
  ): Promise<ReviewMutationResult> {
    return this.mutate((document) =>
      acceptRevision(document, input, this.now, expectedRevision),
    );
  }

  private async read(): Promise<ReviewDocument> {
    return this.store.read();
  }

  private async write(document: ReviewDocument): Promise<void> {
    await this.store.write(document);
  }

  private async mutate(
    operation: (document: ReviewDocument) => ReviewMutationResult,
  ): Promise<ReviewMutationResult> {
    return this.withWriteLock(async () => {
      const result = operation(await this.read());
      await this.write(result.document);
      return structuredClone(result);
    });
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.store.withWriteLock(operation);
  }
}

export const reviewRepository = new FileReviewRepository();

function applyPassageEdits(
  document: ReviewDocument,
  edits: ReviewPassageEdit[],
  expectedRevision?: number,
): ReviewUpdateResult {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== document.revision
  ) {
    return {
      applied: false,
      conflict: {
        kind: "revision",
        expectedRevision,
        actualRevision: document.revision,
      },
      document,
    };
  }
  const editById = new Map<string, ReviewPassageEdit>();
  for (const edit of edits) {
    if (editById.has(edit.id))
      throw new Error(`Passage id appears more than once: ${edit.id}.`);
    const passage = document.passages.find(({ id }) => id === edit.id);
    if (!passage) throw new Error(`Unknown passage id: ${edit.id}.`);
    if (edit.expectedBody !== undefined && edit.expectedBody !== passage.body) {
      return {
        applied: false,
        conflict: {
          kind: "passage",
          id: edit.id,
          actualRevision: document.revision,
          expectedBody: edit.expectedBody,
          actualBody: passage.body,
        },
        document,
      };
    }
    editById.set(edit.id, edit);
  }
  const next = {
    ...document,
    revision: document.revision + 1,
    passages: document.passages.map((passage) => {
      const edit = editById.get(passage.id);
      return edit ? { ...passage, body: edit.body } : passage;
    }),
  };
  next.history = prependHistory(
    document,
    next.revision,
    "Edited review passages",
    "human",
    new Date().toISOString(),
  );
  return {
    applied: true,
    document: next,
    passages: next.passages.filter(({ id }) => editById.has(id)),
  };
}

function addAnnotations(
  document: ReviewDocument,
  annotations: Parameters<ReviewRepository["addAnnotations"]>[0],
  now: () => string,
  nextId: () => string,
): { document: ReviewDocument; annotations: ReviewAnnotation[] } {
  const passageIds = new Set(document.passages.map(({ id }) => id));
  const existingIds = new Set(document.annotations.map(({ id }) => id));
  const additions = annotations.map((annotation) => {
    const missing = annotation.passageIds.filter((id) => !passageIds.has(id));
    if (missing.length > 0)
      throw new Error(`Unknown passage ids: ${missing.join(", ")}.`);
    const id = annotation.id ?? nextId();
    if (existingIds.has(id))
      throw new Error(`Annotation id already exists: ${id}.`);
    existingIds.add(id);
    return {
      ...annotation,
      id,
      status: "open" as const,
      createdAt: now(),
    };
  });
  return {
    document: {
      ...document,
      revision: document.revision + 1,
      annotations: [...document.annotations, ...additions],
      history: prependHistory(
        document,
        document.revision + 1,
        "Added review annotations",
        additions.every(({ author }) => author === "agent") ? "agent" : "human",
        now(),
      ),
    },
    annotations: additions,
  };
}

function resolveAnnotation(
  document: ReviewDocument,
  id: string,
  resolution: "dismissed" | "converted",
  resolutionNote: string,
  now: () => string,
  expectedRevision?: number,
): ReviewMutationResult {
  assertRevision(document, expectedRevision);
  const annotation = document.annotations.find((item) => item.id === id);
  if (!annotation) throw new Error(`Unknown annotation id: ${id}.`);
  if (annotation.status !== "open") return { document };
  const timestamp = now();
  const revision = document.revision + 1;
  return {
    document: {
      ...document,
      revision,
      annotations: document.annotations.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "resolved",
              resolution,
              resolutionNote,
              resolvedAt: timestamp,
            }
          : item,
      ),
      history: prependHistory(
        document,
        revision,
        resolution === "converted"
          ? "Converted review debt"
          : "Dismissed review debt",
        "human",
        timestamp,
      ),
    },
  };
}

function lockDecision(
  document: ReviewDocument,
  id: string,
  now: () => string,
  expectedRevision?: number,
): ReviewMutationResult {
  assertRevision(document, expectedRevision);
  const decision = document.decisions.find((item) => item.id === id);
  if (!decision) throw new Error(`Unknown decision id: ${id}.`);
  if (decision.status !== "open") return { document };
  const timestamp = now();
  const revision = document.revision + 1;
  return {
    document: {
      ...document,
      revision,
      decisions: document.decisions.map((item) =>
        item.id === id
          ? { ...item, status: "locked", resolvedAt: timestamp }
          : item,
      ),
      history: prependHistory(
        document,
        revision,
        "Locked a review decision",
        "human",
        timestamp,
      ),
    },
  };
}

function setAcceptanceCheck(
  document: ReviewDocument,
  id: string,
  checked: boolean,
  now: () => string,
  expectedRevision?: number,
): ReviewMutationResult {
  assertRevision(document, expectedRevision);
  const check = document.acceptance.checklist.find((item) => item.id === id);
  if (!check) throw new Error(`Unknown acceptance check id: ${id}.`);
  if (check.checked === checked) return { document };
  const timestamp = now();
  const revision = document.revision + 1;
  return {
    document: {
      ...document,
      revision,
      acceptance: {
        ...document.acceptance,
        checklist: document.acceptance.checklist.map((item) =>
          item.id === id ? { ...item, checked } : item,
        ),
      },
      history: prependHistory(
        document,
        revision,
        checked ? "Completed acceptance check" : "Reopened acceptance check",
        "human",
        timestamp,
      ),
    },
  };
}

function acceptRevision(
  document: ReviewDocument,
  input: ReviewAcceptanceInput,
  now: () => string,
  expectedRevision?: number,
): ReviewMutationResult {
  assertRevision(document, expectedRevision);
  if (!document.acceptance.checklist.every(({ checked }) => checked))
    throw new Error("Every acceptance check must be complete.");
  const timestamp = now();
  const receipt = {
    id: `acceptance-${document.revision}-${document.acceptance.receipts.length + 1}`,
    revision: document.revision,
    reviewer: input.reviewer,
    device: input.device,
    notes: input.notes,
    checklist: structuredClone(document.acceptance.checklist),
    acceptedAt: timestamp,
  };
  const revision = document.revision + 1;
  return {
    document: {
      ...document,
      revision,
      acceptance: {
        checklist: document.acceptance.checklist,
        receipts: [...document.acceptance.receipts, receipt],
      },
      history: prependHistory(
        document,
        revision,
        `Accepted revision ${document.revision}`,
        input.reviewer,
        timestamp,
      ),
    },
  };
}

function assertRevision(
  document: ReviewDocument,
  expectedRevision?: number,
): void {
  if (expectedRevision !== undefined && expectedRevision !== document.revision)
    throw new Error(
      `Review revision conflict: expected ${expectedRevision}, current ${document.revision}.`,
    );
}

function prependHistory(
  document: ReviewDocument,
  revision: number,
  label: string,
  authoredBy: string,
  createdAt: string,
) {
  return [
    {
      id: `revision-${revision}`,
      revision,
      label,
      parentId: document.history[0]?.id ?? `revision-${document.revision}`,
      authoredBy,
      createdAt,
    },
    ...document.history,
  ];
}

function normalizeReviewDocument(document: ReviewDocument): ReviewDocument {
  const sample = createDraftArticleReviewDocument();
  return {
    ...document,
    decisions: document.decisions.map((decision) => {
      const legacy = decision as Partial<typeof decision>;
      return {
        ...decision,
        kind: legacy.kind ?? "process",
        proposedBy: legacy.proposedBy ?? "agent",
        createdAt:
          legacy.createdAt ??
          sample.decisions.find(({ id }) => id === decision.id)?.createdAt ??
          new Date(0).toISOString(),
      };
    }),
    annotations: document.annotations.map((annotation) => {
      const legacyStatus = annotation.status as string;
      if (legacyStatus !== "dismissed" && legacyStatus !== "converted")
        return annotation;
      return {
        ...annotation,
        status: "resolved",
        resolution: legacyStatus,
      };
    }),
    acceptance: document.acceptance ?? sample.acceptance,
    history: document.history ?? sample.history,
  };
}

export function resolveReviewStorePath(startDirectory = process.cwd()): string {
  return resolveWorkspaceDataPath({
    envPath: process.env.SIGIL_CHAT_REVIEW_PATH,
    relativePath: ".data/review-document.json",
    rootPackageName: "sigil-chat",
    startDirectory,
  });
}

function parseReviewDocument(value: unknown): ReviewDocument | undefined {
  if (!isReviewDocumentShape(value, true)) return undefined;
  const normalized = normalizeReviewDocument(value as ReviewDocument);
  return isReviewDocumentShape(normalized, false) ? normalized : undefined;
}

function isReviewDocumentShape(value: unknown, allowLegacy: boolean): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    !Array.isArray(value.outline) ||
    !value.outline.every(isReviewOutlineItem) ||
    !Array.isArray(value.passages) ||
    !value.passages.every(isReviewPassage) ||
    !Array.isArray(value.decisions) ||
    !value.decisions.every(isReviewDecision) ||
    !Array.isArray(value.annotations) ||
    !value.annotations.every(isReviewAnnotation)
  ) {
    return false;
  }
  const acceptanceValid =
    value.acceptance === undefined ||
    (isRecord(value.acceptance) &&
      Array.isArray(value.acceptance.checklist) &&
      Array.isArray(value.acceptance.receipts));
  const historyValid =
    value.history === undefined || Array.isArray(value.history);
  if (allowLegacy) return acceptanceValid && historyValid;
  return (
    value.acceptance !== undefined &&
    value.history !== undefined &&
    acceptanceValid &&
    historyValid
  );
}

function isReviewOutlineItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.passageIds) &&
    value.passageIds.every((id) => typeof id === "string")
  );
}

function isReviewPassage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sectionId === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.order === "number"
  );
}

function isReviewDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.passageIds) &&
    value.passageIds.every((id) => typeof id === "string") &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    (value.status === "open" || value.status === "locked")
  );
}

function isReviewAnnotation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.passageIds) &&
    value.passageIds.every((id) => typeof id === "string") &&
    typeof value.kind === "string" &&
    typeof value.body === "string" &&
    typeof value.author === "string" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string"
  );
}
