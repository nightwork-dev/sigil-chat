import type { ReviewItem, Story, WorkItemsDocument } from "./types.js";

const SEED_TIMESTAMP = "2026-07-18T00:00:00.000Z";
const DEFAULT_WORKTREE = "sigil-chat-dev";

const seedStories: Story[] = [
  {
    id: "S0.3",
    epicId: "foundation",
    epicTitle: "Foundation",
    title: "Verify the integration baseline",
    intent: "Keep a small lifecycle story available for local roadmap demos.",
    acceptanceCriteria: [
      "The story can transition through the repository lifecycle.",
    ],
    status: "ready",
    routing: "self",
    reviewGate: "none",
    deps: [],
    authoredBy: "Template",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.0",
    epicId: "roadmap",
    epicTitle: "Roadmap",
    title: "Choose the roadmap shape",
    intent: "Exercise owner decisions and persisted review history.",
    acceptanceCriteria: ["The owner can record a roadmap decision."],
    status: "shipped",
    routing: "self",
    reviewGate: "decision:owner",
    deps: [],
    authoredBy: "Template",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.1",
    epicId: "roadmap",
    epicTitle: "Roadmap",
    title: "Persist roadmap stories",
    intent:
      "Exercise story updates, transitions, comments, and review assignment.",
    acceptanceCriteria: [
      "Roadmap mutations persist and reject stale revisions.",
    ],
    status: "ready",
    routing: "implementation",
    reviewGate: "peer",
    deps: ["S1.0"],
    authoredBy: "Template",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const seedReviews: ReviewItem[] = [
  {
    id: "review-S0.3-1",
    storyId: "S0.3",
    assignee: "Owner",
    gate: "browser:owner",
    title: "Confirm the integration baseline",
    summary:
      "Verify the local integration before closing the foundation story.",
    unread: true,
    completed: false,
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: "review-S1.0-2",
    storyId: "S1.0",
    assignee: "Owner",
    gate: "decision:owner",
    title: "Record the roadmap decision",
    summary: "Confirm the selected roadmap shape before dependent work begins.",
    unread: false,
    completed: true,
    decision: "approved",
    createdAt: SEED_TIMESTAMP,
  },
];

export function createWorkItemsDocument(): WorkItemsDocument {
  return {
    revision: 0,
    stories: structuredClone(seedStories).map((story) => ({
      ...story,
      worktree: story.worktree ?? DEFAULT_WORKTREE,
    })),
    comments: [],
    reviews: structuredClone(seedReviews),
    history: [],
  };
}
