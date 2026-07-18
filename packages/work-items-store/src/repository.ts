import {
  isRecord,
  JsonFileStore,
  resolveWorkspaceDataPath,
} from "@workspace/file-store-core";

import { createWorkItemsDocument } from "./sample.js";
import type {
  ReviewAssignment,
  ReviewDecision,
  ReviewGate,
  ReviewItem,
  Routing,
  Story,
  StoryComment,
  StoryStatus,
  WorkItemsDocument,
  WorkItemsMutationResult,
} from "./types.js";

const MAX_HISTORY_ENTRIES = 100;

export interface WorkItemsRepository {
  get(expectedRevision?: number): Promise<WorkItemsDocument>;
  list(expectedRevision?: number): Promise<Story[]>;
  upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
}

export class MemoryWorkItemsRepository implements WorkItemsRepository {
  private document: WorkItemsDocument;
  private readonly now: () => string;

  constructor(options?: {
    document?: WorkItemsDocument;
    now?: () => string;
  }) {
    this.document = structuredClone(
      options?.document ?? createWorkItemsDocument(),
    );
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    assertRevision(this.document, expectedRevision);
    return structuredClone(this.document);
  }

  async list(expectedRevision?: number): Promise<Story[]> {
    assertRevision(this.document, expectedRevision);
    return sortStories(this.document.stories).map((story) =>
      structuredClone(story),
    );
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = upsertStory(this.document, story, expectedRevision);
    this.document = result.document;
    return structuredClone(result);
  }

  async transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = transitionStory(
      this.document,
      id,
      status,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = assignReview(
      this.document,
      id,
      assignment,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = decideReview(
      this.document,
      reviewId,
      decision,
      decidedBy,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = addComment(this.document, comment, expectedRevision);
    this.document = result.document;
    return structuredClone(result);
  }
}

export class FileWorkItemsRepository implements WorkItemsRepository {
  private readonly store: JsonFileStore<WorkItemsDocument>;

  constructor(
    readonly filePath = resolveWorkItemsStorePath(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.store = new JsonFileStore({
      filePath,
      lockLabel: "work-items",
      createInitial: createWorkItemsDocument,
      parse: parseWorkItemsDocument,
      corruptError: (path) =>
        new Error(
          `Work-items store is corrupt at "${path}". Expected a work-items document with valid stories, comments, reviews, and history arrays.`,
        ),
    });
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    const document = await this.store.read();
    assertRevision(document, expectedRevision);
    return structuredClone(document);
  }

  async list(expectedRevision?: number): Promise<Story[]> {
    const document = await this.store.read();
    assertRevision(document, expectedRevision);
    return sortStories(document.stories).map((story) =>
      structuredClone(story),
    );
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      upsertStory(document, story, expectedRevision),
    );
  }

  async transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      transitionStory(document, id, status, this.now, expectedRevision),
    );
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      assignReview(document, id, assignment, this.now, expectedRevision),
    );
  }

  async decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      decideReview(
        document,
        reviewId,
        decision,
        decidedBy,
        this.now,
        expectedRevision,
      ),
    );
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      addComment(document, comment, expectedRevision),
    );
  }

  private async mutate(
    operation: (document: WorkItemsDocument) => WorkItemsMutationResult,
  ): Promise<WorkItemsMutationResult> {
    return this.store.withWriteLock(async () => {
      const result = operation(await this.store.read());
      if (result.changedIds.length > 0) await this.store.write(result.document);
      return structuredClone(result);
    });
  }
}

export const workItemsRepository = new FileWorkItemsRepository();

export function resolveWorkItemsStorePath(
  startDirectory = process.cwd(),
): string {
  return resolveWorkspaceDataPath({
    relativePath: ".data/work-items.json",
    rootPackageName: "sigil-chat",
    startDirectory,
  });
}

function upsertStory(
  document: WorkItemsDocument,
  story: Story,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  assertStory(story);
  const existingIndex = document.stories.findIndex(({ id }) => id === story.id);
  const stories = [...document.stories];
  if (existingIndex === -1) stories.push(structuredClone(story));
  else stories[existingIndex] = structuredClone(story);
  return commit(document, { stories }, [story.id]);
}

function transitionStory(
  document: WorkItemsDocument,
  id: string,
  status: StoryStatus,
  now: () => string,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  const story = findStory(document, id);
  if (story.status === status) return unchanged(document);
  const stories = document.stories.map((item) =>
    item.id === id ? { ...item, status, updatedAt: now() } : item,
  );
  return commit(document, { stories }, [id]);
}

function assignReview(
  document: WorkItemsDocument,
  storyId: string,
  assignment: ReviewAssignment,
  now: () => string,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  const story = findStory(document, storyId);
  const timestamp = now();
  const reviewId = `review-${story.id}-${document.reviews.length + 1}`;
  const review: ReviewItem = {
    id: reviewId,
    storyId,
    assignee: assignment.assignee,
    gate: assignment.gate,
    title: assignment.title ?? story.title,
    summary: assignment.summary ?? story.intent,
    unread: true,
    completed: false,
    createdAt: timestamp,
  };
  const stories = document.stories.map((item) =>
    item.id === storyId
      ? {
          ...item,
          assignee: assignment.assignee,
          reviewDecision: "proposed" as const,
          updatedAt: timestamp,
        }
      : item,
  );
  return commit(
    document,
    { stories, reviews: [...document.reviews, review] },
    [storyId, reviewId],
  );
}

function decideReview(
  document: WorkItemsDocument,
  reviewId: string,
  decision: ReviewDecision,
  decidedBy: string,
  now: () => string,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  const review = document.reviews.find(({ id }) => id === reviewId);
  if (!review) throw new Error(`Unknown review id: ${reviewId}.`);
  if (review.completed) {
    if (review.decision === decision) return unchanged(document);
    throw new Error(`Review is already completed: ${reviewId}.`);
  }
  const story = findStory(document, review.storyId);
  const timestamp = now();
  const reviews = document.reviews.map((item) =>
    item.id === reviewId
      ? { ...item, decision, unread: false, completed: true }
      : item,
  );
  const stories = document.stories.map((item) =>
    item.id === story.id
      ? {
          ...item,
          reviewDecision: decision,
          decidedBy,
          decidedAt: timestamp,
          updatedAt: timestamp,
        }
      : item,
  );
  return commit(document, { stories, reviews }, [story.id, reviewId]);
}

function addComment(
  document: WorkItemsDocument,
  comment: StoryComment,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  findStory(document, comment.storyId);
  if (document.comments.some(({ id }) => id === comment.id))
    throw new Error(`Comment id already exists: ${comment.id}.`);
  if (
    comment.parentCommentId !== undefined &&
    !document.comments.some(
      (item) =>
        item.id === comment.parentCommentId && item.storyId === comment.storyId,
    )
  ) {
    throw new Error(`Unknown parent comment id: ${comment.parentCommentId}.`);
  }
  return commit(
    document,
    { comments: [...document.comments, structuredClone(comment)] },
    [comment.id],
  );
}

function commit(
  document: WorkItemsDocument,
  changes: Partial<WorkItemsDocument>,
  changedIds: string[],
): WorkItemsMutationResult {
  const next = {
    ...document,
    ...structuredClone(changes),
    revision: document.revision + 1,
  };
  next.history = prependHistory(document);
  return { document: next, changedIds };
}

function prependHistory(document: WorkItemsDocument): WorkItemsDocument[] {
  const snapshot = structuredClone(document);
  snapshot.history = [];
  return [snapshot, ...document.history].slice(0, MAX_HISTORY_ENTRIES);
}

function unchanged(document: WorkItemsDocument): WorkItemsMutationResult {
  return { document: structuredClone(document), changedIds: [] };
}

function findStory(document: WorkItemsDocument, id: string): Story {
  const story = document.stories.find((item) => item.id === id);
  if (!story) throw new Error(`Unknown story id: ${id}.`);
  return story;
}

function sortStories(stories: Story[]): Story[] {
  return [...stories].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

function assertRevision(
  document: WorkItemsDocument,
  expectedRevision?: number,
): void {
  if (expectedRevision !== undefined && expectedRevision !== document.revision)
    throw new Error(
      `Work-items revision conflict: expected ${expectedRevision}, current ${document.revision}.`,
    );
}

function parseWorkItemsDocument(
  value: unknown,
): WorkItemsDocument | undefined {
  return isWorkItemsDocument(value, 1)
    ? (value as WorkItemsDocument)
    : undefined;
}

function isWorkItemsDocument(
  value: unknown,
  historyDepth: number,
): value is WorkItemsDocument {
  if (
    !isRecord(value) ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.stories) ||
    !value.stories.every(isStory) ||
    !Array.isArray(value.comments) ||
    !value.comments.every(isStoryComment) ||
    !Array.isArray(value.reviews) ||
    !value.reviews.every(isReviewItem) ||
    !Array.isArray(value.history)
  ) {
    return false;
  }
  if (historyDepth === 0) return value.history.length === 0;
  return value.history.every((entry) =>
    isWorkItemsDocument(entry, historyDepth - 1),
  );
}

function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.epicId === "string" &&
    value.epicId.length > 0 &&
    typeof value.epicTitle === "string" &&
    value.epicTitle.length > 0 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.intent === "string" &&
    value.intent.length > 0 &&
    Array.isArray(value.acceptanceCriteria) &&
    value.acceptanceCriteria.length > 0 &&
    value.acceptanceCriteria.every(
      (criterion) => typeof criterion === "string" && criterion.length > 0,
    ) &&
    isStoryStatus(value.status) &&
    isRouting(value.routing) &&
    isReviewGate(value.reviewGate) &&
    Array.isArray(value.deps) &&
    value.deps.every((dependency) => typeof dependency === "string") &&
    isOptionalString(value.assignee) &&
    isOptionalReviewDecision(value.reviewDecision) &&
    typeof value.authoredBy === "string" &&
    value.authoredBy.length > 0 &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0 &&
    isOptionalString(value.decidedBy) &&
    isOptionalString(value.decidedAt)
  );
}

function isStoryComment(value: unknown): value is StoryComment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.storyId === "string" &&
    value.storyId.length > 0 &&
    isCommentKind(value.kind) &&
    typeof value.author === "string" &&
    value.author.length > 0 &&
    typeof value.body === "string" &&
    value.body.length > 0 &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    isOptionalString(value.parentCommentId)
  );
}

function isReviewItem(value: unknown): value is ReviewItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.storyId === "string" &&
    value.storyId.length > 0 &&
    typeof value.assignee === "string" &&
    value.assignee.length > 0 &&
    isReviewGate(value.gate) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.summary === "string" &&
    value.summary.length > 0 &&
    isOptionalReviewDecision(value.decision) &&
    typeof value.unread === "boolean" &&
    typeof value.completed === "boolean" &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0
  );
}

function assertStory(story: Story): void {
  if (!isStory(story as unknown))
    throw new Error(`Invalid story: ${story.id}.`);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalReviewDecision(
  value: unknown,
): value is ReviewDecision | undefined {
  return value === undefined || isReviewDecision(value);
}

function isReviewDecision(value: unknown): value is ReviewDecision {
  return (
    value === "proposed" ||
    value === "approved" ||
    value === "changes-requested"
  );
}

function isStoryStatus(value: unknown): value is StoryStatus {
  return (
    value === "idea" ||
    value === "spec" ||
    value === "ready" ||
    value === "in-progress" ||
    value === "verify" ||
    value === "shipped" ||
    value === "blocked"
  );
}

function isRouting(value: unknown): value is Routing {
  return (
    value === "self" ||
    value === "claude:opus" ||
    value === "claude:sonnet" ||
    value === "pi:luna"
  );
}

function isReviewGate(value: unknown): value is ReviewGate {
  return (
    value === "browser:David" ||
    value === "decision:David" ||
    value === "peer" ||
    value === "none"
  );
}

function isCommentKind(value: unknown): value is StoryComment["kind"] {
  return (
    value === "question" ||
    value === "suggestion" ||
    value === "concern" ||
    value === "reference" ||
    value === "approval"
  );
}
