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

export interface Story {
  id: string;
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
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
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
