import type { ReviewDocument } from "./types.js";

export function createWeeklyTournamentReviewDocument(): ReviewDocument {
  return {
    id: "weekly-tournament-liveops",
    title: "Weekly Tournament LiveOps Runbook",
    revision: 7,
    outline: [
      {
        id: "configuration",
        title: "Configuration",
        passageIds: ["configuration-01"],
      },
      {
        id: "preflight",
        title: "Preflight",
        passageIds: ["preflight-01", "preflight-02"],
      },
      {
        id: "monitoring",
        title: "Monitoring",
        passageIds: ["monitoring-01"],
      },
      {
        id: "closeout",
        title: "Rollback and closeout",
        passageIds: ["rollback-01", "closeout-02"],
      },
    ],
    passages: [
      {
        id: "configuration-01",
        sectionId: "configuration",
        title: "Configuration freeze",
        body: "Freeze the weekly tournament configuration after economy, matchmaking, and regional schedules have been approved. Record the immutable configuration revision in the launch ticket.",
        order: 0,
      },
      {
        id: "preflight-01",
        sectionId: "preflight",
        title: "Regional availability",
        body: "Confirm the tournament is visible in every active region and that the published start time resolves correctly in each supported locale.",
        order: 1,
      },
      {
        id: "preflight-02",
        sectionId: "preflight",
        title: "Synthetic entry flow",
        body: "Run the synthetic entry flow in every active region. The event must appear in the client, accept enrollment, and return a valid bracket without requiring a cache purge or manual account repair.",
        order: 2,
      },
      {
        id: "monitoring-01",
        sectionId: "monitoring",
        title: "Launch telemetry",
        body: "During the first hour, watch enrollment success, bracket creation latency, match completion, and reward issuance by region. Escalate when any launch threshold remains breached for two consecutive windows.",
        order: 3,
      },
      {
        id: "rollback-01",
        sectionId: "closeout",
        title: "Rollback and closeout",
        body: "If rollback is declared, disable new enrollment, restore the last known-good configuration revision, preserve affected account ids, and open a reward-reconciliation plan before event closeout.",
        order: 4,
      },
      {
        id: "closeout-02",
        sectionId: "closeout",
        title: "Operational record",
        body: "Attach the final regional metrics, incident links, player-impact summary, and reconciliation outcome to the event record before marking the weekly tournament complete.",
        order: 5,
      },
    ],
    decisions: [
      {
        id: "decision-preflight-owner",
        passageIds: ["preflight-02"],
        kind: "process",
        title: "Assign regional preflight ownership",
        body: "Name the operator responsible for certifying every active region before enrollment opens.",
        status: "open",
        proposedBy: "agent",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
      {
        id: "decision-rollback-authority",
        passageIds: ["rollback-01"],
        kind: "process",
        title: "Define rollback authority",
        body: "Specify which incident role can declare rollback and approve reward reconciliation.",
        status: "open",
        proposedBy: "agent",
        createdAt: "2026-06-28T17:00:00.000Z",
      },
    ],
    annotations: [
      {
        id: "annotation-preflight-workaround",
        passageIds: ["preflight-02"],
        kind: "approval",
        body: "Preserve the explicit no-workaround criterion; it catches failures hidden by operator intervention.",
        author: "human",
        status: "open",
        createdAt: "2026-07-02T17:00:00.000Z",
      },
      {
        id: "annotation-rollback-inputs",
        passageIds: ["rollback-01"],
        kind: "question",
        body: "Where is the last known-good revision recorded, and what evidence must the reconciliation plan contain?",
        author: "human",
        status: "open",
        createdAt: "2026-07-03T17:00:00.000Z",
      },
      {
        id: "annotation-cut",
        passageIds: [],
        kind: "flag",
        body: "This note belonged to a removed escalation table. Decide whether its paging thresholds moved into the monitoring section.",
        author: "agent",
        status: "open",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
    ],
    acceptance: {
      checklist: [
        {
          id: "check-pressure",
          label: "Every operator action has a measurable trigger and an owner",
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
        label: "Regional containment pass",
        parentId: "revision-6",
        authoredBy: "human",
        createdAt: "2026-07-02T17:00:00.000Z",
        note: "Separated regional enrollment controls from global event shutdown.",
      },
      {
        id: "revision-6",
        revision: 6,
        label: "Agent escalation pass",
        parentId: "revision-5",
        authoredBy: "agent",
        createdAt: "2026-07-01T17:00:00.000Z",
        note: "Grouped launch checks, monitoring signals, and rollback prerequisites by operator phase.",
      },
      {
        id: "revision-5",
        revision: 5,
        label: "Imported runbook",
        authoredBy: "human",
        createdAt: "2026-06-30T17:00:00.000Z",
      },
    ],
  };
}
