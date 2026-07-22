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
  AddRequestEvidenceInput,
  RequestEvidenceEntry,
  RequestFilter,
  RequestKind,
  RequestOriginMode,
  RequestState,
  RequesterKind,
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
const requestKinds: RequestKind[] = [
  "feature",
  "tool",
  "skill",
  "integration",
  "data-access",
  "defect",
  "workflow",
  "other",
];
const requestStates: RequestState[] = [
  "proposed",
  "awaiting-sponsor",
  "triage",
  "accepted",
  "declined",
  "duplicate",
  "promoted",
  "archived",
];
const requestOriginModes: RequestOriginMode[] = [
  "human-direct",
  "agent-proposal",
  "principal-directed-agent",
  "after-action",
  "imported",
];
const requesterKinds: RequesterKind[] = ["human", "agent"];

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
      revision: existing.revision + 1,
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
  else {
    boardViews[existingIndex] = {
      ...structuredClone(view),
      revision: boardViews[existingIndex].revision + 1,
    };
  }
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
  sponsorshipDecisions: readonly WorkSponsorshipDecision[] = [],
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
  const seenWorkItemIds = new Set<string>();
  for (const story of stories) {
    if (seenWorkItemIds.has(story.id)) continue;
    seenWorkItemIds.add(story.id);
    const matchedScopeIds = matchingScopeIds(story, resultScopeIds);
    if (
      matchedScopeIds.length === 0 ||
      !matchesBoardFilters(story, view, sponsorshipDecisions)
    )
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
          revision: item.revision + 1,
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
          revision: item.revision + 1,
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
          revision: item.revision + 1,
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
    scopeBindings: uniqueStrings(input.relatedScopeIds ?? [])
      .filter((scopeId) => scopeId !== homeScopeId)
      .map((scopeId) => ({ scopeId, relation: "rolls-up-to" as const })),
    provenance: {
      origin: context.originMode === "human-direct" ? "principal" : "agent",
      actorPrincipalId: context.actorPrincipalId,
      requesterId: context.requesterId ?? context.actorPrincipalId,
      requesterKind:
        context.requesterKind ??
        (context.originMode === "human-direct" ? "human" : "agent"),
      principalId: context.actorPrincipalId,
      originMode: context.originMode ?? "agent-proposal",
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
    request: {
      requestKind: input.requestKind ?? "feature",
      requestState: input.proposedSponsorPrincipalId
        ? "awaiting-sponsor"
        : "proposed",
      problem: input.problem.trim(),
      desiredOutcome: input.desiredOutcome.trim(),
      evidence: initialRequestEvidence(
        input,
        {
          observedById: context.requesterId ?? context.actorPrincipalId,
          observedByKind:
            context.requesterKind ??
            (context.originMode === "human-direct" ? "human" : "agent"),
          scopeId: homeScopeId,
          now: context.now,
        },
      ),
      relatedScopeIds: uniqueStrings(input.relatedScopeIds ?? []),
      promotedSpecIds: [],
      promotedStoryIds: [],
      ...(input.proposedApproach
        ? { proposedApproach: input.proposedApproach.trim() }
        : {}),
      ...(input.impact ? { impact: input.impact.trim() } : {}),
      ...(input.frequency ? { frequency: input.frequency.trim() } : {}),
      ...(input.constraints ? { constraints: input.constraints.trim() } : {}),
      ...(input.targetAudience
        ? { targetAudience: input.targetAudience.trim() }
        : {}),
    },
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

export function addRequestEvidence(
  document: WorkItemsDocument,
  input: AddRequestEvidenceInput,
  context: FeatureRequestProposalContext,
): WorkItemsMutationResult {
  assertRevision(document, input.expectedRevision);
  assertFeatureRequestProposalContext(context);
  assertRequestEvidenceInput(input);
  const story = findStory(document, input.requestId);
  if (story.kind !== "feature-request")
    throw new Error(`Work item is not a request: ${input.requestId}.`);
  const timestamp = context.now;
  const nextEvidence: RequestEvidenceEntry = {
    id: nextRequestEvidenceId(story),
    observedById: context.requesterId ?? context.actorPrincipalId,
    observedByKind: context.requesterKind ?? "agent",
    scopeId: context.currentScopeId,
    constraint: input.evidence.constraint.trim(),
    workaround: input.evidence.workaround.trim(),
    cost: input.evidence.cost.trim(),
    expectedImprovement: input.evidence.expectedImprovement.trim(),
    ...(input.evidence.proof ? { proof: input.evidence.proof.trim() } : {}),
    ...(input.evidence.taskRef
      ? { taskRef: input.evidence.taskRef.trim() }
      : {}),
    ...(input.evidence.sourceRefs
      ? { sourceRefs: input.evidence.sourceRefs.map((ref) => ref.trim()) }
      : {}),
    createdAt: timestamp,
  };
  const request = requestDetailsFor(story);
  const stories = document.stories.map((item) =>
    item.id === story.id
      ? {
          ...item,
          request: {
            ...request,
            evidence: [...request.evidence, nextEvidence],
          },
          updatedAt: timestamp,
          revision: item.revision + 1,
        }
      : item,
  );
  return commit(document, { stories }, [story.id, nextEvidence.id]);
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

export function filterRequests(
  stories: readonly Story[],
  filter?: RequestFilter,
): Story[] {
  const query = filter?.query ? normalizeSearchText(filter.query) : undefined;
  return sortStories(
    stories.filter((story) => {
      if (story.kind !== "feature-request") return false;
      const request = requestDetailsFor(story);
      return (
        (filter?.requestKind === undefined ||
          request.requestKind === filter.requestKind) &&
        (filter?.requestState === undefined ||
          request.requestState === filter.requestState) &&
        (filter?.homeScopeId === undefined ||
          story.homeScopeId === filter.homeScopeId) &&
        (filter?.sponsorPrincipalId === undefined ||
          story.provenance.proposedSponsorPrincipalId ===
            filter.sponsorPrincipalId) &&
        (filter?.requesterId === undefined ||
          (story.provenance.requesterId ?? story.provenance.actorPrincipalId) ===
            filter.requesterId) &&
        (query === undefined ||
          normalizeSearchText(
            `${story.title}\n${request.problem}\n${request.desiredOutcome}`,
          ).includes(query))
      );
    }),
  ).map((story) => structuredClone(withRequestDefaults(story)));
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
  return isWorkItemsDocument(value, 1) ? structuredClone(value) : undefined;
}

export function normalizeWorkItemsDocument(
  value: WorkItemsDocument,
): WorkItemsDocument {
  if (!isWorkItemsDocument(value, 1))
    throw new Error("Invalid work-items document.");
  return structuredClone(value);
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
    !hasUniqueIds(value.stories) ||
    !Array.isArray(value.boardViews) ||
    !value.boardViews.every(isBoardView) ||
    !hasUniqueIds(value.boardViews) ||
    !Array.isArray(value.comments) ||
    !value.comments.every(isStoryComment) ||
    !Array.isArray(value.reviews) ||
    !value.reviews.every(isReviewItem) ||
    !Array.isArray(value.sponsorshipDecisions) ||
    !value.sponsorshipDecisions.every(isWorkSponsorshipDecision) ||
    !hasUniqueIds(value.sponsorshipDecisions) ||
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
    isWorkKind(value.kind) &&
    isNonEmptyString(value.homeScopeId) &&
    isScopeBindings(value.scopeBindings) &&
    isOptionalString(value.parentWorkItemId) &&
    isWorkProvenance(value.provenance) &&
    isPositiveInteger(value.revision) &&
    isOptionalString(value.worktree) &&
    typeof value.epicId === "string" &&
    value.epicId.length > 0 &&
    typeof value.epicTitle === "string" &&
    value.epicTitle.length > 0 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.intent === "string" &&
    value.intent.length > 0 &&
    (value.request === undefined || isWorkRequestDetails(value.request)) &&
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasUniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map(({ id }) => id)).size === values.length;
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

function isScopeBindings(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (binding) =>
        isRecord(binding) &&
        isNonEmptyString(binding.scopeId) &&
        (binding.relation === "mounted-in" ||
          binding.relation === "rolls-up-to"),
    )
  );
}

function isWorkProvenance(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.origin === "principal" || value.origin === "agent") &&
    isNonEmptyString(value.actorPrincipalId) &&
    isOptionalString(value.requesterId) &&
    (value.requesterKind === undefined ||
      requesterKinds.includes(value.requesterKind as RequesterKind)) &&
    isOptionalString(value.principalId) &&
    (value.originMode === undefined ||
      requestOriginModes.includes(value.originMode as RequestOriginMode)) &&
    isOptionalString(value.agentSessionId) &&
    isOptionalString(value.proposedSponsorPrincipalId) &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) &&
        value.sourceRefs.every(isNonEmptyString))) &&
    isNonEmptyString(value.createdAt)
  );
}

function isWorkRequestDetails(value: unknown): boolean {
  return (
    isRecord(value) &&
    requestKinds.includes(value.requestKind as RequestKind) &&
    requestStates.includes(value.requestState as RequestState) &&
    isNonEmptyString(value.problem) &&
    isNonEmptyString(value.desiredOutcome) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isRequestEvidenceEntry) &&
    Array.isArray(value.relatedScopeIds) &&
    value.relatedScopeIds.every(isNonEmptyString) &&
    Array.isArray(value.promotedSpecIds) &&
    value.promotedSpecIds.every(isNonEmptyString) &&
    Array.isArray(value.promotedStoryIds) &&
    value.promotedStoryIds.every(isNonEmptyString) &&
    isOptionalString(value.proposedApproach) &&
    isOptionalString(value.impact) &&
    isOptionalString(value.frequency) &&
    isOptionalString(value.constraints) &&
    isOptionalString(value.targetAudience)
  );
}

function isRequestEvidenceEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.observedById) &&
    requesterKinds.includes(value.observedByKind as RequesterKind) &&
    isNonEmptyString(value.scopeId) &&
    isNonEmptyString(value.constraint) &&
    isNonEmptyString(value.workaround) &&
    isNonEmptyString(value.cost) &&
    isNonEmptyString(value.expectedImprovement) &&
    isOptionalString(value.proof) &&
    isOptionalString(value.taskRef) &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) &&
        value.sourceRefs.every(isNonEmptyString))) &&
    isNonEmptyString(value.createdAt)
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
  const rootOrder = new Map(view.roots.map((root, index) => [root, index]));
  const matchesByScope = new Map<string, BoardScopeMatch>();
  for (const match of raw) {
    if (
      !match ||
      typeof match.scopeId !== "string" ||
      typeof match.rootScopeId !== "string" ||
      !rootSet.has(match.rootScopeId)
    ) {
      continue;
    }
    const existing = matchesByScope.get(match.scopeId);
    if (
      existing === undefined ||
      (rootOrder.get(match.rootScopeId) ?? Number.MAX_SAFE_INTEGER) <
        (rootOrder.get(existing.rootScopeId) ?? Number.MAX_SAFE_INTEGER)
    ) {
      matchesByScope.set(match.scopeId, {
        scopeId: match.scopeId,
        rootScopeId: match.rootScopeId,
      });
    }
  }
  // Both traversal modes include their roots. The resolver contributes only
  // descendants/rollups; omitting a root must never turn `self-and-rollups`
  // into "rollups but not self."
  for (const root of view.roots) {
    if (!matchesByScope.has(root))
      matchesByScope.set(root, { scopeId: root, rootScopeId: root });
  }
  return [...matchesByScope.values()];
}

function matchingScopeIds(story: Story, resultScopeIds: Set<string>): string[] {
  const matched: string[] = [];
  if (resultScopeIds.has(story.homeScopeId)) matched.push(story.homeScopeId);
  for (const binding of story.scopeBindings) {
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

function matchesBoardFilters(
  story: Story,
  view: BoardView,
  sponsorshipDecisions: readonly WorkSponsorshipDecision[],
): boolean {
  const { filters } = view;
  return (
    (filters.status === undefined || filters.status.includes(story.status)) &&
    (filters.kind === undefined || filters.kind.includes(story.kind)) &&
    (filters.assigneePrincipalId === undefined ||
      filters.assigneePrincipalId === story.assigneePrincipalId) &&
    (filters.sponsorPrincipalId === undefined ||
      hasConfirmedSponsor(
        story.id,
        filters.sponsorPrincipalId,
        sponsorshipDecisions,
      ))
  );
}

function hasConfirmedSponsor(
  workItemId: string,
  sponsorPrincipalId: string,
  decisions: readonly WorkSponsorshipDecision[],
): boolean {
  const latest = decisions
    .filter(
      (decision) =>
        decision.workItemId === workItemId &&
        decision.sponsorPrincipalId === sponsorPrincipalId,
    )
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.decidedAt.localeCompare(left.decidedAt) ||
        right.id.localeCompare(left.id),
    )[0];
  return latest?.decision === "confirmed";
}

function assertFeatureRequestProposalInput(
  input: FeatureRequestProposalInput,
): void {
  if (
    (input.requestKind !== undefined &&
      !requestKinds.includes(input.requestKind)) ||
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
    (input.structuredEvidence !== undefined &&
      (!Array.isArray(input.structuredEvidence) ||
        !input.structuredEvidence.every(isRequestEvidenceInputShape))) ||
    (input.relatedScopeIds !== undefined &&
      (!Array.isArray(input.relatedScopeIds) ||
        !input.relatedScopeIds.every((entry) => entry.trim().length > 0))) ||
    (input.proposedApproach !== undefined &&
      input.proposedApproach.trim().length === 0) ||
    (input.impact !== undefined && input.impact.trim().length === 0) ||
    (input.frequency !== undefined && input.frequency.trim().length === 0) ||
    (input.constraints !== undefined &&
      input.constraints.trim().length === 0) ||
    (input.targetAudience !== undefined &&
      input.targetAudience.trim().length === 0) ||
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
    (context.requesterId !== undefined &&
      context.requesterId.trim().length === 0) ||
    (context.requesterKind !== undefined &&
      !requesterKinds.includes(context.requesterKind)) ||
    (context.originMode !== undefined &&
      !requestOriginModes.includes(context.originMode)) ||
    (context.agentSessionId !== undefined &&
      context.agentSessionId.trim().length === 0)
  ) {
    throw new Error("Invalid feature request proposal context.");
  }
}

function assertRequestEvidenceInput(input: AddRequestEvidenceInput): void {
  if (
    input.requestId.trim().length === 0 ||
    !isRequestEvidenceInputShape(input.evidence)
  ) {
    throw new Error("Invalid request evidence.");
  }
}

function isRequestEvidenceInputShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.constraint) &&
    isNonEmptyString(value.workaround) &&
    isNonEmptyString(value.cost) &&
    isNonEmptyString(value.expectedImprovement) &&
    isOptionalString(value.proof) &&
    isOptionalString(value.taskRef) &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) &&
        value.sourceRefs.every(isNonEmptyString)))
  );
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

function initialRequestEvidence(
  input: FeatureRequestProposalInput,
  context: {
    observedById: string;
    observedByKind: RequesterKind;
    scopeId: string;
    now: string;
  },
): RequestEvidenceEntry[] {
  const structured = input.structuredEvidence ?? [];
  if (structured.length > 0) {
    return structured.map((entry, index) => ({
      id: `evidence-${index + 1}`,
      observedById: context.observedById,
      observedByKind: context.observedByKind,
      scopeId: context.scopeId,
      constraint: entry.constraint.trim(),
      workaround: entry.workaround.trim(),
      cost: entry.cost.trim(),
      expectedImprovement: entry.expectedImprovement.trim(),
      ...(entry.proof ? { proof: entry.proof.trim() } : {}),
      ...(entry.taskRef ? { taskRef: entry.taskRef.trim() } : {}),
      ...(entry.sourceRefs
        ? { sourceRefs: entry.sourceRefs.map((ref) => ref.trim()) }
        : {}),
      createdAt: context.now,
    }));
  }
  const evidence = input.evidence?.map((entry) => entry.trim()) ?? [];
  if (evidence.length === 0) return [];
  return [
    {
      id: "evidence-1",
      observedById: context.observedById,
      observedByKind: context.observedByKind,
      scopeId: context.scopeId,
      constraint: evidence.join("\n"),
      workaround: "Not recorded.",
      cost: "Not recorded.",
      expectedImprovement: input.desiredOutcome.trim(),
      ...(input.sourceRefs ? { sourceRefs: input.sourceRefs } : {}),
      createdAt: context.now,
    },
  ];
}

function requestDetailsFor(story: Story): NonNullable<Story["request"]> {
  return {
    requestKind: story.request?.requestKind ?? "feature",
    requestState:
      story.request?.requestState ??
      (story.provenance.proposedSponsorPrincipalId
        ? "awaiting-sponsor"
        : "proposed"),
    problem: story.request?.problem ?? problemFromIntent(story.intent),
    desiredOutcome:
      story.request?.desiredOutcome ?? desiredOutcomeFromIntent(story.intent),
    evidence: story.request?.evidence ?? [],
    relatedScopeIds:
      story.request?.relatedScopeIds ??
      story.scopeBindings.map((binding) => binding.scopeId),
    promotedSpecIds: story.request?.promotedSpecIds ?? [],
    promotedStoryIds: story.request?.promotedStoryIds ?? [],
    ...(story.request?.proposedApproach
      ? { proposedApproach: story.request.proposedApproach }
      : {}),
    ...(story.request?.impact ? { impact: story.request.impact } : {}),
    ...(story.request?.frequency ? { frequency: story.request.frequency } : {}),
    ...(story.request?.constraints
      ? { constraints: story.request.constraints }
      : {}),
    ...(story.request?.targetAudience
      ? { targetAudience: story.request.targetAudience }
      : {}),
  };
}

function withRequestDefaults(story: Story): Story {
  return story.kind === "feature-request"
    ? { ...story, request: requestDetailsFor(story) }
    : story;
}

function problemFromIntent(intent: string): string {
  const match = /Problem\n([\s\S]*?)(?:\n\nDesired outcome\n|$)/.exec(intent);
  return (match?.[1] ?? intent).trim();
}

function desiredOutcomeFromIntent(intent: string): string {
  const match = /Desired outcome\n([\s\S]*?)(?:\n\nEvidence\n|$)/.exec(intent);
  return (match?.[1] ?? intent).trim();
}

function nextRequestEvidenceId(story: Story): string {
  const next =
    requestDetailsFor(story).evidence
      .map(({ id }) => /^evidence-(\d+)$/.exec(id)?.[1])
      .filter((value): value is string => value !== undefined)
      .map((value) => Number.parseInt(value, 10))
      .filter(Number.isInteger)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `evidence-${next}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))].filter(
    (value) => value.length > 0,
  );
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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
      return story.kind;
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
