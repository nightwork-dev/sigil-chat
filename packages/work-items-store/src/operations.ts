import { isRecord } from "@workspace/file-store-core";

import type {
  BoardQueryItem,
  BoardQueryResult,
  BoardScopeMatch,
  BoardTraversalResolver,
  BoardView,
  BoardViewFilter,
  ChildProgress,
  FeatureRequestDuplicateDecision,
  FeatureRequestProposalContext,
  FeatureRequestProposalInput,
  FeatureRequestProposalResult,
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
  WorkSponsorshipDecision,
} from "./types.js";

const MAX_HISTORY_ENTRIES = 100;
const FEATURE_REQUEST_DUPLICATE_THRESHOLD = 0.82;

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
  else {
    const existing = stories[existingIndex];
    stories[existingIndex] = {
      ...structuredClone(story),
      ...(existing.revision === undefined
        ? {}
        : { revision: existing.revision + 1 }),
    };
  }
  return commit(document, { stories }, [story.id]);
}

export function upsertBoardView(
  document: WorkItemsDocument,
  view: BoardView,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  assertBoardView(view);
  const existingIndex = document.boardViews.findIndex(
    ({ id }) => id === view.id,
  );
  const boardViews = [...document.boardViews];
  if (existingIndex === -1) boardViews.push(structuredClone(view));
  else boardViews[existingIndex] = structuredClone(view);
  return commit(document, { boardViews }, [view.id]);
}

export function filterBoardViews(
  views: BoardView[],
  filter?: BoardViewFilter,
): BoardView[] {
  if (!filter) return views;
  return views.filter(
    (view) =>
      (filter.ownerScopeId === undefined ||
        view.ownerScopeId === filter.ownerScopeId) &&
      (filter.ownerPrincipalId === undefined ||
        view.ownerPrincipalId === filter.ownerPrincipalId) &&
      (filter.visibility === undefined ||
        view.visibility === filter.visibility),
  );
}

/**
 * Evaluate a saved board after the host has supplied its authorized scope
 * traversal. Rows are de-duplicated by work-item id before grouping, so a
 * shared record has one card, status, and history regardless of path count.
 */
export function queryBoardView(
  stories: readonly Story[],
  view: BoardView,
  traversal: BoardTraversalResolver,
): BoardQueryResult {
  assertBoardView(view);
  const matches = orderedScopeMatches(view, traversal);
  const resultScopeIds = new Set(matches.map(({ scopeId }) => scopeId));
  const rootOrder = new Map(view.roots.map((root, index) => [root, index]));
  const childrenByParent = new Map<string, Story[]>();
  for (const story of stories) {
    if (!story.parentWorkItemId) continue;
    const children = childrenByParent.get(story.parentWorkItemId) ?? [];
    children.push(story);
    childrenByParent.set(story.parentWorkItemId, children);
  }

  const items: BoardQueryItem[] = [];
  for (const story of stories) {
    const matchedScopeIds = matchingScopeIds(story, resultScopeIds);
    if (matchedScopeIds.length === 0 || !matchesBoardFilters(story, view))
      continue;
    const childProgress = progressFor(childrenByParent.get(story.id));
    items.push({
      story: structuredClone(story),
      group: groupFor(story, view, matchedScopeIds, matches, rootOrder),
      matchedScopeIds,
      ...(childProgress ? { childProgress } : {}),
    });
  }
  return { view: structuredClone(view), items };
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
    item.id === id
      ? {
          ...item,
          status,
          updatedAt: now(),
          ...(item.revision === undefined
            ? {}
            : { revision: item.revision + 1 }),
        }
      : item,
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
          ...(item.revision === undefined
            ? {}
            : { revision: item.revision + 1 }),
        }
      : item,
  );
  return commit(document, { stories, reviews: [...document.reviews, review] }, [
    storyId,
    reviewId,
  ]);
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
          ...(item.revision === undefined
            ? {}
            : { revision: item.revision + 1 }),
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

export function proposeFeatureRequest(
  document: WorkItemsDocument,
  input: FeatureRequestProposalInput,
  context: FeatureRequestProposalContext,
  expectedRevision?: number,
): FeatureRequestProposalResult {
  assertRevision(document, expectedRevision);
  assertFeatureRequestProposalInput(input);
  assertFeatureRequestProposalContext(context);
  const title = input.title.trim();
  const homeScopeId = input.intendedScopeId?.trim() || context.currentScopeId;
  const duplicateDecision = decideFeatureRequestDuplicates(document, {
    title,
    homeScopeId,
  });
  if (duplicateDecision.outcome === "duplicate") {
    return {
      outcome: "duplicate",
      document: structuredClone(document),
      duplicateDecision,
      candidates: duplicateDecision.candidates,
      changedIds: [],
    };
  }
  const story: Story = {
    id: nextFeatureRequestId(document),
    kind: "feature-request",
    homeScopeId,
    provenance: {
      origin: "agent",
      actorPrincipalId: context.actorPrincipalId,
      ...(context.agentSessionId
        ? { agentSessionId: context.agentSessionId }
        : {}),
      ...(input.proposedSponsorPrincipalId
        ? {
            proposedSponsorPrincipalId: input.proposedSponsorPrincipalId.trim(),
          }
        : {}),
      ...(input.sourceRefs && input.sourceRefs.length > 0
        ? { sourceRefs: input.sourceRefs.map((reference) => reference.trim()) }
        : {}),
      createdAt: context.now,
    },
    revision: 1,
    epicId: "feature-requests",
    epicTitle: "Feature requests",
    title,
    intent: featureRequestIntent(input),
    acceptanceCriteria: [],
    status: "idea",
    routing: "strategy",
    reviewGate: "none",
    deps: [],
    authoredBy: context.actorPrincipalId,
    createdAt: context.now,
    updatedAt: context.now,
  };
  const result = commit(document, { stories: [...document.stories, story] }, [
    story.id,
  ]);
  return {
    outcome: "created",
    document: result.document,
    workItem: structuredClone(story),
    duplicateDecision,
    changedIds: result.changedIds,
  };
}

export function decideFeatureRequestDuplicates(
  document: WorkItemsDocument,
  input: { title: string; homeScopeId: string },
): FeatureRequestDuplicateDecision {
  const normalizedTitle = normalizeDuplicateTitle(input.title);
  const candidates = document.stories
    .filter(
      (story) =>
        story.kind === "feature-request" &&
        story.homeScopeId === input.homeScopeId,
    )
    .map((workItem) => {
      const score = titleSimilarity(
        normalizedTitle,
        normalizeDuplicateTitle(workItem.title),
      );
      return {
        workItem: structuredClone(workItem),
        reason:
          normalizeDuplicateTitle(workItem.title) === normalizedTitle
            ? "exact-normalized-title"
            : "similar-title",
        score,
      } as const;
    })
    .filter(
      (candidate) =>
        candidate.reason === "exact-normalized-title" ||
        candidate.score >= FEATURE_REQUEST_DUPLICATE_THRESHOLD,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.workItem.id.localeCompare(right.workItem.id),
    );
  return {
    outcome: candidates.length > 0 ? "duplicate" : "clear",
    normalizedTitle,
    threshold: FEATURE_REQUEST_DUPLICATE_THRESHOLD,
    candidates,
  };
}

export function recordSponsorshipDecision(
  document: WorkItemsDocument,
  decision: WorkSponsorshipDecision,
  expectedRevision?: number,
): WorkItemsMutationResult {
  assertRevision(document, expectedRevision);
  assertWorkSponsorshipDecision(decision);
  findStory(document, decision.workItemId);
  const existing = document.sponsorshipDecisions.find(
    (item) => item.id === decision.id,
  );
  if (existing)
    throw new Error(`Sponsorship decision id already exists: ${decision.id}.`);
  return commit(
    document,
    { sponsorshipDecisions: [...document.sponsorshipDecisions, decision] },
    [decision.id],
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
export function filterStories(stories: Story[], filter?: StoryFilter): Story[] {
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
  if (!isWorkItemsDocument(value, 1)) return undefined;
  return normalizeWorkItemsDocument(value);
}

/** Additive migration for JSON documents written before saved board views. */
export function normalizeWorkItemsDocument(
  value: WorkItemsDocument | Record<string, unknown>,
): WorkItemsDocument {
  const document = value as WorkItemsDocument;
  const normalized = {
    ...structuredClone(document),
    boardViews: Array.isArray(document.boardViews)
      ? structuredClone(document.boardViews)
      : [],
    sponsorshipDecisions: Array.isArray(document.sponsorshipDecisions)
      ? structuredClone(document.sponsorshipDecisions)
      : [],
  };
  normalized.history = normalized.history.map((entry) =>
    normalizeWorkItemsDocument(entry),
  );
  return normalized;
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
    (value.boardViews !== undefined &&
      (!Array.isArray(value.boardViews) ||
        !value.boardViews.every(isBoardView))) ||
    !Array.isArray(value.comments) ||
    !value.comments.every(isStoryComment) ||
    !Array.isArray(value.reviews) ||
    !value.reviews.every(isReviewItem) ||
    (value.sponsorshipDecisions !== undefined &&
      (!Array.isArray(value.sponsorshipDecisions) ||
        !value.sponsorshipDecisions.every(isWorkSponsorshipDecision))) ||
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
    isOptionalWorkKind(value.kind) &&
    isOptionalString(value.homeScopeId) &&
    isOptionalScopeBindings(value.scopeBindings) &&
    isOptionalString(value.parentWorkItemId) &&
    isOptionalWorkProvenance(value.provenance) &&
    isOptionalNonNegativeInteger(value.revision) &&
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
    isOptionalString(value.assigneePrincipalId) &&
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

export function assertBoardView(view: BoardView): void {
  if (!isBoardView(view as unknown))
    throw new Error(`Invalid board view: ${view.id}.`);
}

export function assertWorkSponsorshipDecision(
  decision: WorkSponsorshipDecision,
): void {
  if (!isWorkSponsorshipDecision(decision as unknown))
    throw new Error(`Invalid sponsorship decision: ${decision.id}.`);
}

export function isWorkSponsorshipDecision(
  value: unknown,
): value is WorkSponsorshipDecision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.workItemId === "string" &&
    value.workItemId.length > 0 &&
    typeof value.sponsorPrincipalId === "string" &&
    value.sponsorPrincipalId.length > 0 &&
    (value.decision === "confirmed" || value.decision === "declined") &&
    typeof value.decidedByPrincipalId === "string" &&
    value.decidedByPrincipalId.length > 0 &&
    typeof value.decidedAt === "string" &&
    value.decidedAt.length > 0 &&
    isNonNegativeInteger(value.revision)
  );
}

export function isBoardView(value: unknown): value is BoardView {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.ownerScopeId === "string" &&
    value.ownerScopeId.length > 0 &&
    isOptionalString(value.ownerPrincipalId) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.visibility === "private" || value.visibility === "published") &&
    Array.isArray(value.roots) &&
    value.roots.length > 0 &&
    value.roots.every((root) => typeof root === "string" && root.length > 0) &&
    new Set(value.roots).size === value.roots.length &&
    (value.traversal === "self" || value.traversal === "self-and-rollups") &&
    isBoardViewFilters(value.filters) &&
    (value.groupBy === "status" ||
      value.groupBy === "scope" ||
      value.groupBy === "assignee" ||
      value.groupBy === "kind") &&
    isNonNegativeInteger(value.revision)
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(
  value: unknown,
): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isOptionalWorkKind(value: unknown): boolean {
  return value === undefined || isWorkKind(value);
}

function isWorkKind(value: unknown): boolean {
  return (
    value === "feature-request" ||
    value === "story" ||
    value === "task" ||
    value === "defect" ||
    value === "decision"
  );
}

function isOptionalScopeBindings(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (binding) =>
          isRecord(binding) &&
          typeof binding.scopeId === "string" &&
          binding.scopeId.length > 0 &&
          (binding.relation === "mounted-in" ||
            binding.relation === "rolls-up-to"),
      ))
  );
}

function isOptionalWorkProvenance(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value.origin === "principal" || value.origin === "agent") &&
      typeof value.actorPrincipalId === "string" &&
      value.actorPrincipalId.length > 0 &&
      isOptionalString(value.agentSessionId) &&
      isOptionalString(value.proposedSponsorPrincipalId) &&
      (value.sourceRefs === undefined ||
        (Array.isArray(value.sourceRefs) &&
          value.sourceRefs.every(
            (reference) => typeof reference === "string",
          ))) &&
      typeof value.createdAt === "string" &&
      value.createdAt.length > 0)
  );
}

function isBoardViewFilters(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.status === undefined ||
      (Array.isArray(value.status) && value.status.every(isStoryStatus))) &&
    (value.kind === undefined ||
      (Array.isArray(value.kind) && value.kind.every(isWorkKind))) &&
    isOptionalString(value.assigneePrincipalId) &&
    isOptionalString(value.sponsorPrincipalId)
  );
}

function orderedScopeMatches(
  view: BoardView,
  traversal: BoardTraversalResolver,
): BoardScopeMatch[] {
  const raw = traversal.resolve(view.roots, view.traversal);
  const rootSet = new Set(view.roots);
  const seen = new Set<string>();
  const matches: BoardScopeMatch[] = [];
  for (const match of raw) {
    if (
      !match ||
      typeof match.scopeId !== "string" ||
      typeof match.rootScopeId !== "string" ||
      !rootSet.has(match.rootScopeId) ||
      seen.has(match.scopeId)
    ) {
      continue;
    }
    seen.add(match.scopeId);
    matches.push({ scopeId: match.scopeId, rootScopeId: match.rootScopeId });
  }
  // A resolver for `self` is allowed to return no rows; roots remain eligible.
  if (view.traversal === "self") {
    for (const root of view.roots) {
      if (!seen.has(root)) matches.push({ scopeId: root, rootScopeId: root });
    }
  }
  return matches;
}

function matchingScopeIds(story: Story, resultScopeIds: Set<string>): string[] {
  const matched: string[] = [];
  if (story.homeScopeId && resultScopeIds.has(story.homeScopeId))
    matched.push(story.homeScopeId);
  for (const binding of story.scopeBindings ?? []) {
    if (
      binding.relation === "rolls-up-to" &&
      resultScopeIds.has(binding.scopeId) &&
      !matched.includes(binding.scopeId)
    ) {
      matched.push(binding.scopeId);
    }
  }
  return matched;
}

function matchesBoardFilters(story: Story, view: BoardView): boolean {
  const { filters } = view;
  return (
    (filters.status === undefined || filters.status.includes(story.status)) &&
    (filters.kind === undefined ||
      (story.kind !== undefined && filters.kind.includes(story.kind))) &&
    (filters.assigneePrincipalId === undefined ||
      filters.assigneePrincipalId === story.assigneePrincipalId) &&
    (filters.sponsorPrincipalId === undefined ||
      filters.sponsorPrincipalId ===
        story.provenance?.proposedSponsorPrincipalId)
  );
}

function assertFeatureRequestProposalInput(
  input: FeatureRequestProposalInput,
): void {
  if (
    typeof input.problem !== "string" ||
    typeof input.title !== "string" ||
    input.title.trim().length === 0 ||
    input.problem.trim().length === 0 ||
    typeof input.desiredOutcome !== "string" ||
    input.desiredOutcome.trim().length === 0 ||
    (input.evidence !== undefined &&
      (!Array.isArray(input.evidence) ||
        !input.evidence.every((entry) => entry.trim().length > 0))) ||
    (input.sourceRefs !== undefined &&
      (!Array.isArray(input.sourceRefs) ||
        !input.sourceRefs.every((entry) => entry.trim().length > 0))) ||
    (input.intendedScopeId !== undefined &&
      input.intendedScopeId.trim().length === 0) ||
    (input.proposedSponsorPrincipalId !== undefined &&
      input.proposedSponsorPrincipalId.trim().length === 0)
  ) {
    throw new Error("Invalid feature request proposal.");
  }
}

function assertFeatureRequestProposalContext(
  context: FeatureRequestProposalContext,
): void {
  if (
    context.actorPrincipalId.trim().length === 0 ||
    context.currentScopeId.trim().length === 0 ||
    context.now.trim().length === 0 ||
    (context.agentSessionId !== undefined &&
      context.agentSessionId.trim().length === 0)
  ) {
    throw new Error("Invalid feature request proposal context.");
  }
}

function featureRequestIntent(input: FeatureRequestProposalInput): string {
  const lines = [
    "Problem",
    input.problem.trim(),
    "",
    "Desired outcome",
    input.desiredOutcome.trim(),
  ];
  const evidence = input.evidence?.map((entry) => entry.trim()) ?? [];
  if (evidence.length > 0) {
    lines.push("", "Evidence", ...evidence.map((entry) => `- ${entry}`));
  }
  return lines.join("\n");
}

function nextFeatureRequestId(document: WorkItemsDocument): string {
  const next =
    document.stories
      .map(({ id }) => /^FR\.(\d+)$/.exec(id)?.[1])
      .filter((value): value is string => value !== undefined)
      .map((value) => Number.parseInt(value, 10))
      .filter(Number.isInteger)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `FR.${next}`;
}

function normalizeDuplicateTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length === 0 || right.length === 0) return 0;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const union = new Set([...leftTokens, ...rightTokens]);
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const tokenScore = union.size === 0 ? 0 : intersection / union.size;
  const editScore =
    1 - levenshtein(left, right) / Math.max(left.length, right.length);
  return Math.max(tokenScore, editScore);
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function progressFor(children: Story[] | undefined): ChildProgress | undefined {
  if (!children || children.length === 0) return undefined;
  return {
    total: children.length,
    shipped: children.filter((child) => child.status === "shipped").length,
  };
}

function groupFor(
  story: Story,
  view: BoardView,
  matchedScopeIds: string[],
  matches: BoardScopeMatch[],
  rootOrder: Map<string, number>,
): string {
  switch (view.groupBy) {
    case "status":
      return story.status;
    case "assignee":
      return story.assigneePrincipalId ?? story.assignee ?? "unassigned";
    case "kind":
      return story.kind ?? "story";
    case "scope": {
      if (story.homeScopeId && matchedScopeIds.includes(story.homeScopeId))
        return story.homeScopeId;
      const matchingRoots = matches
        .filter(({ scopeId }) => matchedScopeIds.includes(scopeId))
        .sort(
          (left, right) =>
            (rootOrder.get(left.rootScopeId) ?? Number.MAX_SAFE_INTEGER) -
              (rootOrder.get(right.rootScopeId) ?? Number.MAX_SAFE_INTEGER) ||
            left.scopeId.localeCompare(right.scopeId),
        );
      return matchingRoots[0]?.rootScopeId ?? view.roots[0];
    }
  }
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
    value === "strategy" ||
    value === "design" ||
    value === "implementation" ||
    value === "research"
  );
}

function isReviewGate(value: unknown): value is ReviewGate {
  return (
    value === "browser:owner" ||
    value === "decision:owner" ||
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
