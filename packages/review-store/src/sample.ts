import type { ReviewDocument } from "./types.js";

export function createDraftArticleReviewDocument(): ReviewDocument {
  return {
    id: "draft-article-review",
    title: "Draft Article Review: A Technical Onboarding Guide",
    revision: 7,
    outline: [
      {
        id: "outline",
        title: "Outline",
        passageIds: ["outline-01"],
      },
      {
        id: "draft",
        title: "Draft passes",
        passageIds: ["draft-01", "draft-02"],
      },
      {
        id: "factcheck",
        title: "Fact-check",
        passageIds: ["factcheck-01"],
      },
      {
        id: "closeout",
        title: "Revise and publish",
        passageIds: ["revise-01", "publish-02"],
      },
    ],
    passages: [
      {
        id: "outline-01",
        sectionId: "outline",
        title: "Outline locked",
        body: "Lock the outline after the thesis, audience, and section order have been approved. Record the outline revision the draft is written against in the review ticket.",
        order: 0,
      },
      {
        id: "draft-01",
        sectionId: "draft",
        title: "Opening hook",
        body: "Rewrite the opening to lead with the reader's actual problem, not the history of the topic. Cut the throat-clearing paragraphs that come before the first concrete example.",
        order: 1,
      },
      {
        id: "draft-02",
        sectionId: "draft",
        title: "Section structure",
        body: "Walk each major section in a consistent order: the mistake, why it happens, and the fix. Flag any section that skips the 'why it happens' step — it reads as an assertion instead of an explanation.",
        order: 2,
      },
      {
        id: "factcheck-01",
        sectionId: "factcheck",
        title: "Verify the technical claims",
        body: "Confirm every code sample runs against the pinned dependency versions, and that every claimed benchmark, version number, or API behavior is checked against a primary source, not remembered.",
        order: 3,
      },
      {
        id: "revise-01",
        sectionId: "closeout",
        title: "Revision and cut list",
        body: "If a section is cut, remove its cross-references, archive the removed prose in the revision history, and open a follow-up note for any claim the cut section was the only place substantiating.",
        order: 4,
      },
      {
        id: "publish-02",
        sectionId: "closeout",
        title: "Publication record",
        body: "Attach the final word count, reviewer sign-offs, fact-check sources, and publish date to the article record before marking the draft complete.",
        order: 5,
      },
    ],
    decisions: [
      {
        id: "decision-draft-owner",
        passageIds: ["draft-02"],
        kind: "process",
        title: "Assign a structural editor",
        body: "Name the editor responsible for approving the section order before the next draft pass.",
        status: "open",
        proposedBy: "agent",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
      {
        id: "decision-publish-authority",
        passageIds: ["revise-01"],
        kind: "process",
        title: "Define publish authority",
        body: "Specify who can approve the final cut list and sign off on publication.",
        status: "open",
        proposedBy: "agent",
        createdAt: "2026-06-28T17:00:00.000Z",
      },
    ],
    annotations: [
      {
        id: "annotation-factcheck-sourcing",
        passageIds: ["factcheck-01"],
        kind: "approval",
        body: "Preserve the explicit primary-source requirement; it catches claims that survive only because no one re-checked them.",
        author: "human",
        status: "open",
        createdAt: "2026-07-02T17:00:00.000Z",
      },
      {
        id: "annotation-publish-inputs",
        passageIds: ["revise-01"],
        kind: "question",
        body: "Where is the citation list stored, and what evidence must the fact-check note contain?",
        author: "human",
        status: "open",
        createdAt: "2026-07-03T17:00:00.000Z",
      },
      {
        id: "annotation-cut",
        passageIds: [],
        kind: "flag",
        body: "This note belonged to a removed appendix. Decide whether its worked example moved into the draft section.",
        author: "agent",
        status: "open",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
    ],
    acceptance: {
      checklist: [
        {
          id: "check-pressure",
          label: "Every claim has a checkable source and an owner",
          checked: false,
        },
        {
          id: "check-debt",
          label: "Every orphaned annotation has been triaged",
          checked: false,
        },
        {
          id: "check-decisions",
          label: "Every open decision is locked or deliberately superseded",
          checked: false,
        },
      ],
      receipts: [],
    },
    history: [
      {
        id: "revision-7",
        revision: 7,
        label: "Structural cut pass",
        parentId: "revision-6",
        authoredBy: "human",
        createdAt: "2026-07-02T17:00:00.000Z",
        note: "Separated the revision/cut list from the publication record.",
      },
      {
        id: "revision-6",
        revision: 6,
        label: "Agent fact-check pass",
        parentId: "revision-5",
        authoredBy: "agent",
        createdAt: "2026-07-01T17:00:00.000Z",
        note: "Grouped draft passes, fact-check requirements, and publish prerequisites by editorial phase.",
      },
      {
        id: "revision-5",
        revision: 5,
        label: "Imported draft",
        authoredBy: "human",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
    ],
  };
}
