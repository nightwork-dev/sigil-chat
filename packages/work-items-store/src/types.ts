export type StoryStatus =
  "idea" | "spec" | "ready" | "in-progress" | "verify" | "shipped" | "blocked";

export type ReviewDecision = "proposed" | "approved" | "changes-requested";
export type Routing =
  "self" | "strategy" | "design" | "implementation" | "research";
export type ReviewGate = "browser:owner" | "decision:owner" | "peer" | "none";

/** The durable product-work categories defined by the scoped-work contract. */
export type WorkKind =
  "feature-request" | "story" | "task" | "defect" | "decision";

/** A non-owning scope participation relation for one work item. */
export interface ScopeBinding {
  scopeId: string;
  relation: "mounted-in" | "rolls-up-to";
}

/** Trusted-origin metadata for a work item. */
export interface WorkProvenance {
  origin: "principal" | "agent";
  actorPrincipalId: string;
  agentSessionId?: string;
  proposedSponsorPrincipalId?: string;
  sourceRefs?: string[];
  createdAt: string;
}

/**
 * Extraction verdict: every UI-touching
 * story records this before verify/shipped — whether it consumed an existing
 * sigil-design component, extracted a new one, flagged a candidate for a real
 * X-story, or is app-domain. Defaults to "pending" for UI work.
 */
export type ExtractionVerdict =
  "pending" | "consumed" | "extracted" | "app-domain" | `candidate:${string}`;

export interface Story {
  id: string;
  /**
   * Scoped-work fields are optional for legacy external roadmap records. New
   * scoped records should provide every field below; repositories never invent
   * a home while reading an older roadmap file.
   */
  kind?: WorkKind;
  homeScopeId?: string;
  scopeBindings?: ScopeBinding[];
  parentWorkItemId?: string;
  provenance?: WorkProvenance;
  /** Per-record optimistic revision, distinct from the document revision. */
  revision?: number;
  /**
   * Workstream this story belongs to (e.g. "sigil-chat-dev"). Used by
   * `list({ worktree })` to scope the board to a single workstream.
   */
  worktree?: string;
  epicId: string;
  epicTitle: string;
  title: string;
  intent: string;
  acceptanceCriteria: string[];
  status: StoryStatus;
  routing: Routing;
  reviewGate: ReviewGate;
  deps: string[];
  assignee?: string;
  /** Stable principal identity when assignment is principal-backed. */
  assigneePrincipalId?: string;
  reviewDecision?: ReviewDecision;
  /** Sigil-first extraction verdict — required for UI-touching
   *  stories before verify/shipped; defaults to "pending" for UI work. */
  extraction?: ExtractionVerdict;
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

export type BoardTraversal = "self" | "self-and-rollups";
export type BoardVisibility = "private" | "published";
export type BoardGroupBy = "status" | "scope" | "assignee" | "kind";

export interface BoardViewFilters {
  status?: StoryStatus[];
  kind?: WorkKind[];
  assigneePrincipalId?: string;
  sponsorPrincipalId?: string;
}

/** A durable, scope-rooted saved query over work records. */
export interface BoardView {
  id: string;
  ownerScopeId: string;
  ownerPrincipalId?: string;
  name: string;
  visibility: BoardVisibility;
  roots: string[];
  traversal: BoardTraversal;
  filters: BoardViewFilters;
  groupBy: BoardGroupBy;
  revision: number;
}

export interface WorkSponsorshipDecision {
  id: string;
  workItemId: string;
  sponsorPrincipalId: string;
  decision: "confirmed" | "declined";
  decidedByPrincipalId: string;
  decidedAt: string;
  revision: number;
}

export interface WorkSponsorshipDecisionFilter {
  workItemId?: string;
  sponsorPrincipalId?: string;
}

export interface FeatureRequestProposalInput {
  problem: string;
  desiredOutcome: string;
  evidence?: string[];
  sourceRefs?: string[];
  intendedScopeId?: string;
  proposedSponsorPrincipalId?: string;
}

export interface FeatureRequestProposalContext {
  actorPrincipalId: string;
  agentSessionId?: string;
  currentScopeId: string;
  now: string;
}

export interface FeatureRequestDuplicateCandidate {
  workItem: Story;
  reason: "exact-normalized-title" | "similar-title";
  score: number;
}

export interface FeatureRequestDuplicateDecision {
  outcome: "clear" | "duplicate";
  normalizedTitle: string;
  threshold: number;
  candidates: FeatureRequestDuplicateCandidate[];
}

export type FeatureRequestProposalResult =
  | {
      outcome: "created";
      document: WorkItemsDocument;
      workItem: Story;
      duplicateDecision: FeatureRequestDuplicateDecision;
      changedIds: string[];
    }
  | {
      outcome: "duplicate";
      document: WorkItemsDocument;
      duplicateDecision: FeatureRequestDuplicateDecision;
      candidates: FeatureRequestDuplicateCandidate[];
      changedIds: [];
    };

export interface BoardViewFilter {
  ownerScopeId?: string;
  ownerPrincipalId?: string;
  visibility?: BoardVisibility;
}

/**
 * A scope matched by a board root. The caller supplies this from the scoped
 * traversal service after authorization; this package owns no scope graph.
 */
export interface BoardScopeMatch {
  scopeId: string;
  rootScopeId: string;
}

export interface BoardTraversalResolver {
  resolve(
    roots: readonly string[],
    traversal: BoardTraversal,
  ): readonly BoardScopeMatch[];
}

export interface ChildProgress {
  total: number;
  shipped: number;
}

export interface BoardQueryItem {
  story: Story;
  group: string;
  matchedScopeIds: string[];
  childProgress?: ChildProgress;
}

export interface BoardQueryResult {
  view: BoardView;
  items: BoardQueryItem[];
}

/** Optional filter for {@link WorkItemsRepository.list}. */
export interface StoryFilter {
  worktree?: string;
  /** Matches {@link Story.epicId}. */
  epic?: string;
  status?: StoryStatus;
}

export interface StoryComment {
  id: string;
  storyId: string;
  kind: "question" | "suggestion" | "concern" | "reference" | "approval";
  author: string;
  body: string;
  createdAt: string;
  parentCommentId?: string;
  /**
   * Who this comment is for — a persona id ("coordinator" | "strategist" | "analysis") or
   * undefined for a general comment. Open-but-validated, not a closed enum:
   * the team roster grows (personas), and an unknown value must degrade to
   * "general", never reject the whole store. The
   * board surfaces "addressed to me"; a `@name` mention in the body is the
   * comms-delivery path (slice 2), distinct from this addressing field.
   */
  addressee?: string;
}

export interface ReviewItem {
  id: string;
  storyId: string;
  assignee: string;
  gate: ReviewGate;
  title: string;
  summary: string;
  decision?: ReviewDecision;
  unread: boolean;
  completed: boolean;
  createdAt: string;
}

export interface WorkItemsDocument {
  revision: number;
  stories: Story[];
  boardViews: BoardView[];
  comments: StoryComment[];
  reviews: ReviewItem[];
  sponsorshipDecisions: WorkSponsorshipDecision[];
  history: WorkItemsDocument[];
}

export interface ReviewAssignment {
  assignee: string;
  gate: ReviewGate;
  title?: string;
  summary?: string;
}

export interface WorkItemsMutationResult {
  document: WorkItemsDocument;
  changedIds: string[];
}
