import { isRecord } from "@workspace/file-store-core";

import type {
  ReviewAssignment,
  ReviewDecision,
  ReviewGate,
  ReviewItem,
  Routing,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsDocument,
  WorkItemsMutationResult,
} from "./types.js";

const MAX_HISTORY_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Pure document mutations. These operate on a WorkItemsDocument and return the
// next document plus the ids that changed; every repository implementation
// (memory, JSON file, markdown/git) reads its document, applies one of these,
// then persists the result in its own way.
// ---------------------------------------------------------------------------

export function upsertStory(
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

export function transitionStory(
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

export function assignReview(
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

export function decideReview(
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

export function addComment(
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

export function sortStories(stories: Story[]): Story[] {
  return [...stories].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

/** Return only the stories matching every provided filter facet. */
export function filterStories(
  stories: Story[],
  filter?: StoryFilter,
): Story[] {
  if (!filter) return stories;
  return stories.filter(
    (story) =>
      (filter.worktree === undefined || story.worktree === filter.worktree) &&
      (filter.epic === undefined || story.epicId === filter.epic) &&
      (filter.status === undefined || story.status === filter.status),
  );
}

export function assertRevision(
  document: WorkItemsDocument,
  expectedRevision?: number,
): void {
  if (expectedRevision !== undefined && expectedRevision !== document.revision)
    throw new Error(
      `Work-items revision conflict: expected ${expectedRevision}, current ${document.revision}.`,
    );
}

export function parseWorkItemsDocument(
  value: unknown,
): WorkItemsDocument | undefined {
  return isWorkItemsDocument(value, 1)
    ? (value as WorkItemsDocument)
    : undefined;
}

export function isWorkItemsDocument(
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

export function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isOptionalString(value.worktree) &&
    typeof value.epicId === "string" &&
    value.epicId.length > 0 &&
    typeof value.epicTitle === "string" &&
    value.epicTitle.length > 0 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.intent === "string" &&
    value.intent.length > 0 &&
    // Acceptance criteria may be empty: idea/spec-stage stories (e.g. a "## Shape
    // sketch") legitimately have none yet — ACs are added at the spec/ready
    // stage. Requiring them here made the whole board fail to load on the first
    // idea story (D4.6).
    Array.isArray(value.acceptanceCriteria) &&
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

export function isStoryComment(value: unknown): value is StoryComment {
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

export function isReviewItem(value: unknown): value is ReviewItem {
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

export function assertStory(story: Story): void {
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
    value === "pi:luna" ||
    value === "codex"
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
