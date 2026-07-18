export type StoryStatus =
  | "idea"
  | "spec"
  | "ready"
  | "in-progress"
  | "verify"
  | "shipped"
  | "blocked";

export type ReviewDecision = "proposed" | "approved" | "changes-requested";
export type Routing = "self" | "claude:opus" | "claude:sonnet" | "pi:luna";
export type ReviewGate =
  | "browser:David"
  | "decision:David"
  | "peer"
  | "none";

/**
 * Extraction verdict (sigil-first gate, Fable 2026-07-18): every UI-touching
 * story records this before verify/shipped — whether it consumed an existing
 * sigil-design component, extracted a new one, flagged a candidate for a real
 * X-story, or is app-domain. Defaults to "pending" for UI work.
 */
export type ExtractionVerdict =
  | "pending"
  | "consumed"
  | "extracted"
  | "app-domain"
  | `candidate:${string}`;

export interface Story {
  id: string;
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
  reviewDecision?: ReviewDecision;
  /** Sigil-first extraction verdict (Fable gate) — required for UI-touching
   *  stories before verify/shipped; defaults to "pending" for UI work. */
  extraction?: ExtractionVerdict;
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
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
  comments: StoryComment[];
  reviews: ReviewItem[];
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
