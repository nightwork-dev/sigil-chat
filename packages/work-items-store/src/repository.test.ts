import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkItemsDocument } from "./sample";
import { queryBoardView } from "./operations";
import type { Story, WorkSponsorshipDecision } from "./types";
import {
  FileWorkItemsRepository,
  MemoryWorkItemsRepository,
} from "./repository";

const temporaryDirectories: string[] = [];

async function seedStory(id: string) {
  const story = createWorkItemsDocument().stories.find(
    (candidate) => candidate.id === id,
  );
  if (!story) throw new Error(`Missing seed story ${id}.`);
  return structuredClone(story);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MemoryWorkItemsRepository", () => {
  it("seeds template stories and applies the work-item lifecycle", async () => {
    const repository = new MemoryWorkItemsRepository({
      now: () => "2026-07-18T20:00:00.000Z",
    });
    const initial = await repository.get();

    expect(await repository.list()).toHaveLength(3);
    expect(initial.stories.find(({ id }) => id === "S1.1")).toMatchObject({
      kind: "story",
      homeScopeId: "installation:default",
      scopeBindings: [],
      provenance: {
        origin: "principal",
        actorPrincipalId: "principal:template",
      },
      revision: 1,
      epicId: "roadmap",
      status: "ready",
      routing: "implementation",
      reviewGate: "peer",
      deps: ["S1.0"],
    });
    expect(initial.reviews).toHaveLength(2);

    const story = await seedStory("S1.1");
    story.title = "work-items-store package + story schema (verified)";
    const upserted = await repository.upsertStory(story, initial.revision);
    expect(upserted.changedIds).toEqual(["S1.1"]);

    const transitioned = await repository.transitionStory(
      "S1.1",
      "in-progress",
      upserted.document.revision,
    );
    expect(transitioned.changedIds).toEqual(["S1.1"]);

    const assigned = await repository.assignReview(
      "S1.1",
      {
        assignee: "Owner",
        gate: "peer",
        title: "Review the store",
        summary: "Check persistence and concurrency behavior.",
      },
      transitioned.document.revision,
    );
    // Two reviews are pre-seeded, so the third review (this story's first)
    // is assigned id review-S1.1-3.
    expect(assigned.changedIds).toEqual(["S1.1", "review-S1.1-3"]);
    const assignedReview = assigned.document.reviews.find(
      ({ id }) => id === "review-S1.1-3",
    );
    expect(assignedReview).toMatchObject({
      id: "review-S1.1-3",
      storyId: "S1.1",
      assignee: "Owner",
      unread: true,
      completed: false,
    });
    expect(assignedReview).not.toHaveProperty("decision");

    const decided = await repository.decideReview(
      "review-S1.1-3",
      "approved",
      "Owner",
      assigned.document.revision,
    );
    expect(
      decided.document.reviews.find(({ id }) => id === "review-S1.1-3"),
    ).toMatchObject({
      decision: "approved",
      unread: false,
      completed: true,
    });
    expect(
      decided.document.stories.find(({ id }) => id === "S1.1"),
    ).toMatchObject({
      reviewDecision: "approved",
      decidedBy: "Owner",
      decidedAt: "2026-07-18T20:00:00.000Z",
    });

    const commented = await repository.addComment(
      {
        id: "comment-1",
        storyId: "S1.1",
        kind: "approval",
        author: "Owner",
        body: "The store behavior is ready for the next track.",
        createdAt: "2026-07-18T20:01:00.000Z",
      },
      decided.document.revision,
    );
    expect(commented.changedIds).toEqual(["comment-1"]);
    expect(commented.document.comments).toHaveLength(1);
    expect(commented.document.revision).toBe(5);
    expect(commented.document.history).toHaveLength(5);
  });

  it("persists saved views and evaluates one scoped record in one board cell", async () => {
    const repository = new MemoryWorkItemsRepository();
    let document = await repository.get();
    const parent = await seedStory("S0.3");
    parent.kind = "story";
    parent.homeScopeId = "workspace-a";
    parent.provenance = {
      origin: "principal",
      actorPrincipalId: "principal-a",
      createdAt: "2026-07-21T00:00:00.000Z",
    };
    parent.revision = 1;
    document = (await repository.upsertStory(parent, document.revision))
      .document;

    const child = await seedStory("S1.0");
    child.kind = "task";
    child.homeScopeId = "workspace-b";
    child.parentWorkItemId = parent.id;
    child.scopeBindings = [{ scopeId: "project-a", relation: "rolls-up-to" }];
    child.provenance = {
      origin: "agent",
      actorPrincipalId: "principal-a",
      agentSessionId: "session-a",
      createdAt: "2026-07-21T00:00:00.000Z",
    };
    child.revision = 2;
    document = (await repository.upsertStory(child, document.revision))
      .document;

    const mountedOnly = await seedStory("S1.1");
    mountedOnly.kind = "task";
    mountedOnly.homeScopeId = "foreign-workspace";
    mountedOnly.scopeBindings = [
      { scopeId: "project-a", relation: "mounted-in" },
    ];
    mountedOnly.provenance = {
      origin: "principal",
      actorPrincipalId: "principal-a",
      createdAt: "2026-07-21T00:00:00.000Z",
    };
    mountedOnly.revision = 1;
    document = (await repository.upsertStory(mountedOnly, document.revision))
      .document;
    document = (
      await repository.transitionStory("S0.3", "in-progress", document.revision)
    ).document;

    const view = {
      id: "board-project-a",
      ownerScopeId: "project-a",
      name: "Project A roadmap",
      visibility: "private" as const,
      roots: ["project-a"],
      traversal: "self-and-rollups" as const,
      filters: {},
      groupBy: "scope" as const,
      revision: 1,
    };
    document = (await repository.upsertBoardView(view, document.revision))
      .document;
    expect(
      await repository.listBoardViews({ ownerScopeId: "project-a" }),
    ).toEqual([view]);

    const result = queryBoardView(document.stories, view, {
      resolve: (roots, traversal) => {
        expect(roots).toEqual(["project-a"]);
        expect(traversal).toBe("self-and-rollups");
        return [
          { scopeId: "project-a", rootScopeId: "project-a" },
          { scopeId: "workspace-a", rootScopeId: "project-a" },
          { scopeId: "workspace-b", rootScopeId: "project-a" },
        ];
      },
    });

    expect(result.items.map(({ story }) => story.id)).toEqual(["S0.3", "S1.0"]);
    expect(result.items.find(({ story }) => story.id === "S0.3")).toMatchObject(
      {
        group: "workspace-a",
        childProgress: { total: 1, shipped: 1 },
        // Child completion is derived progress only; it does not ship its parent.
        story: { status: "in-progress", revision: 3 },
      },
    );
    expect(result.items.find(({ story }) => story.id === "S1.0")).toMatchObject(
      {
        group: "workspace-b",
        matchedScopeIds: ["workspace-b", "project-a"],
      },
    );
  });

  it("rejects records missing canonical scoped-work fields", async () => {
    const repository = new MemoryWorkItemsRepository();
    const invalid = (await seedStory("S0.3")) as Partial<Story>;
    delete invalid.homeScopeId;

    await expect(repository.upsertStory(invalid as Story)).rejects.toThrow(
      "Invalid story: S0.3",
    );
  });

  it("uses declared root order for a multi-root match and renders one card", async () => {
    const story = await seedStory("S0.3");
    story.homeScopeId = "workspace-shared";
    story.scopeBindings = [
      { scopeId: "project-a", relation: "rolls-up-to" },
      { scopeId: "project-b", relation: "rolls-up-to" },
    ];
    const view = {
      id: "portfolio",
      ownerScopeId: "installation:default",
      name: "Portfolio",
      visibility: "private" as const,
      roots: ["project-a", "project-b"],
      traversal: "self-and-rollups" as const,
      filters: {},
      groupBy: "scope" as const,
      revision: 1,
    };

    const result = queryBoardView([story, structuredClone(story)], view, {
      resolve: () => [
        { scopeId: "workspace-shared", rootScopeId: "project-b" },
        { scopeId: "workspace-shared", rootScopeId: "project-a" },
        { scopeId: "project-b", rootScopeId: "project-b" },
        { scopeId: "project-a", rootScopeId: "project-a" },
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      group: "workspace-shared",
      story: { id: "S0.3" },
    });

    story.homeScopeId = "workspace-outside-result";
    const rebound = queryBoardView([story], view, {
      resolve: () => [
        { scopeId: "project-b", rootScopeId: "project-b" },
        { scopeId: "project-a", rootScopeId: "project-a" },
      ],
    });
    expect(rebound.items).toHaveLength(1);
    expect(rebound.items[0].group).toBe("project-a");
  });

  it("filters sponsored boards by the latest durable confirmation", async () => {
    const story = await seedStory("S0.3");
    story.homeScopeId = "project-a";
    story.provenance.proposedSponsorPrincipalId = "principal-sponsor";
    const view = {
      id: "sponsored",
      ownerScopeId: "project-a",
      name: "Sponsored work",
      visibility: "private" as const,
      roots: ["project-a"],
      traversal: "self" as const,
      filters: { sponsorPrincipalId: "principal-sponsor" },
      groupBy: "status" as const,
      revision: 1,
    };
    const traversal = {
      resolve: () => [{ scopeId: "project-a", rootScopeId: "project-a" }],
    };
    const confirmed: WorkSponsorshipDecision = {
      id: "sponsor-1",
      workItemId: story.id,
      sponsorPrincipalId: "principal-sponsor",
      decision: "confirmed",
      decidedByPrincipalId: "principal-sponsor",
      decidedAt: "2026-07-21T01:00:00.000Z",
      revision: 1,
    };

    expect(queryBoardView([story], view, traversal).items).toEqual([]);
    expect(
      queryBoardView([story], view, traversal, [confirmed]).items,
    ).toHaveLength(1);
    expect(
      queryBoardView([story], view, traversal, [
        confirmed,
        {
          ...confirmed,
          id: "sponsor-2",
          decision: "declined",
          decidedAt: "2026-07-21T02:00:00.000Z",
          revision: 2,
        },
      ]).items,
    ).toEqual([]);
  });

  it("increments saved-view revisions on update", async () => {
    const repository = new MemoryWorkItemsRepository();
    const initial = await repository.get();
    const view = {
      id: "board-a",
      ownerScopeId: "project-a",
      name: "Board A",
      visibility: "private" as const,
      roots: ["project-a"],
      traversal: "self" as const,
      filters: {},
      groupBy: "status" as const,
      revision: 1,
    };
    const created = await repository.upsertBoardView(view, initial.revision);
    await repository.upsertBoardView(
      { ...view, name: "Renamed", revision: 1 },
      created.document.revision,
    );

    await expect(repository.listBoardViews()).resolves.toEqual([
      { ...view, name: "Renamed", revision: 2 },
    ]);
  });

  it("proposes idea-stage feature requests with agent provenance and blocks reshaped duplicates", async () => {
    const repository = new MemoryWorkItemsRepository();
    const created = await repository.proposeFeatureRequest(
      {
        title: "Save filtered evidence boards",
        problem: "Users cannot save filtered evidence boards.",
        desiredOutcome:
          "Let users keep a durable board view for repeated evidence review.",
        evidence: ["Repeated sessions rebuild the same filter set."],
        sourceRefs: ["artifact:evidence-42"],
        proposedSponsorPrincipalId: "user-sponsor",
      },
      {
        actorPrincipalId: "user-1",
        agentSessionId: "thread-1",
        currentScopeId: "workspace-a",
        now: "2026-07-21T22:00:00.000Z",
      },
    );

    expect(created).toMatchObject({
      outcome: "created",
      changedIds: ["FR.1"],
      workItem: {
        id: "FR.1",
        kind: "feature-request",
        homeScopeId: "workspace-a",
        status: "idea",
        title: "Save filtered evidence boards",
        provenance: {
          origin: "agent",
          actorPrincipalId: "user-1",
          agentSessionId: "thread-1",
          proposedSponsorPrincipalId: "user-sponsor",
          sourceRefs: ["artifact:evidence-42"],
          createdAt: "2026-07-21T22:00:00.000Z",
        },
      },
    });
    expect(created.outcome === "created" && created.workItem).toMatchObject({
      acceptanceCriteria: [],
      reviewGate: "none",
    });

    const exactDuplicate = await repository.proposeFeatureRequest(
      {
        title: "save   filtered EVIDENCE boards!",
        problem: "users   cannot SAVE filtered evidence boards!",
        desiredOutcome: "Try to sneak past exact normalization.",
      },
      {
        actorPrincipalId: "user-1",
        currentScopeId: "workspace-a",
        now: "2026-07-21T22:01:00.000Z",
      },
    );
    expect(exactDuplicate).toMatchObject({
      outcome: "duplicate",
      changedIds: [],
      candidates: [
        {
          reason: "exact-normalized-title",
          workItem: { id: "FR.1" },
        },
      ],
    });
    await expect(repository.get()).resolves.toMatchObject({ revision: 1 });

    const fuzzyDuplicate = await repository.proposeFeatureRequest(
      {
        title: "Save filtered evidence board",
        problem: "Users cannot save filtered evidence board.",
        desiredOutcome: "Singular wording should still block.",
      },
      {
        actorPrincipalId: "user-1",
        currentScopeId: "workspace-a",
        now: "2026-07-21T22:02:00.000Z",
      },
    );
    expect(fuzzyDuplicate).toMatchObject({
      outcome: "duplicate",
      changedIds: [],
      candidates: [
        {
          reason: "similar-title",
          workItem: { id: "FR.1" },
        },
      ],
    });
    await expect(repository.get()).resolves.toMatchObject({ revision: 1 });
  });

  it("searches generalized request records and appends structured evidence", async () => {
    const repository = new MemoryWorkItemsRepository();
    const created = await repository.proposeFeatureRequest(
      {
        requestKind: "tool",
        title: "Record after-action request evidence",
        problem: "Agents cannot preserve concrete task friction.",
        desiredOutcome:
          "A repeated task can add evidence to one canonical request.",
        structuredEvidence: [
          {
            constraint: "The request shape was only feature-specific.",
            workaround: "The agent encoded request details in prose.",
            cost: "Triage could not filter by tool or workflow need.",
            expectedImprovement: "Request views can group tool requests.",
            proof: "A request search by kind returns this item.",
          },
        ],
        relatedScopeIds: ["project-a"],
        proposedApproach: "Generalize the intake schema.",
      },
      {
        actorPrincipalId: "user-1",
        requesterId: "agent:eve",
        requesterKind: "agent",
        originMode: "after-action",
        agentSessionId: "thread-1",
        currentScopeId: "workspace-a",
        now: "2026-07-22T02:00:00.000Z",
      },
    );
    if (created.outcome !== "created") throw new Error("Expected create.");

    await expect(
      repository.searchRequests({ requestKind: "tool" }),
    ).resolves.toMatchObject({
      revision: 1,
      requests: [
        {
          id: "FR.1",
          request: {
            requestKind: "tool",
            requestState: "proposed",
            problem: "Agents cannot preserve concrete task friction.",
            desiredOutcome:
              "A repeated task can add evidence to one canonical request.",
            relatedScopeIds: ["project-a"],
            proposedApproach: "Generalize the intake schema.",
            evidence: [
              {
                id: "evidence-1",
                observedById: "agent:eve",
                observedByKind: "agent",
                constraint: "The request shape was only feature-specific.",
              },
            ],
          },
          provenance: {
            requesterId: "agent:eve",
            requesterKind: "agent",
            originMode: "after-action",
          },
        },
      ],
    });

    const evidence = await repository.addRequestEvidence(
      {
        requestId: "FR.1",
        evidence: {
          constraint: "A duplicate surfaced during implementation.",
          workaround: "The agent manually searched the roadmap.",
          cost: "Extra review time.",
          expectedImprovement:
            "The agent can append evidence to the existing request.",
          taskRef: "S1.11",
        },
        expectedRevision: created.document.revision,
      },
      {
        actorPrincipalId: "user-1",
        requesterId: "agent:eve",
        requesterKind: "agent",
        originMode: "after-action",
        currentScopeId: "workspace-a",
        now: "2026-07-22T02:01:00.000Z",
      },
    );

    expect(evidence.changedIds).toEqual(["FR.1", "evidence-2"]);
    await expect(repository.inspectRequest("FR.1")).resolves.toMatchObject({
      revision: 2,
      request: {
        request: {
          evidence: [
            { id: "evidence-1" },
            {
              id: "evidence-2",
              taskRef: "S1.11",
              cost: "Extra review time.",
            },
          ],
        },
      },
    });
  });

  it("records sponsorship decisions separately from agent proposals", async () => {
    const repository = new MemoryWorkItemsRepository();
    const created = await repository.proposeFeatureRequest(
      {
        title: "Stable evidence card labels",
        problem: "Evidence cards need stable labels.",
        desiredOutcome: "Cards remain recognizable across chat turns.",
        proposedSponsorPrincipalId: "user-sponsor",
      },
      {
        actorPrincipalId: "user-1",
        currentScopeId: "workspace-a",
        now: "2026-07-21T22:05:00.000Z",
      },
    );
    if (created.outcome !== "created") throw new Error("Expected create.");

    const decision = await repository.recordSponsorshipDecision(
      {
        id: "sponsorship-FR.1-user-sponsor-1",
        workItemId: created.workItem.id,
        sponsorPrincipalId: "user-sponsor",
        decision: "confirmed",
        decidedByPrincipalId: "user-sponsor",
        decidedAt: "2026-07-21T22:06:00.000Z",
        revision: 1,
      },
      created.document.revision,
    );

    expect(decision.changedIds).toEqual(["sponsorship-FR.1-user-sponsor-1"]);
    await expect(
      repository.listSponsorshipDecisions({
        workItemId: created.workItem.id,
        sponsorPrincipalId: "user-sponsor",
      }),
    ).resolves.toEqual([
      {
        id: "sponsorship-FR.1-user-sponsor-1",
        workItemId: "FR.1",
        sponsorPrincipalId: "user-sponsor",
        decision: "confirmed",
        decidedByPrincipalId: "user-sponsor",
        decidedAt: "2026-07-21T22:06:00.000Z",
        revision: 1,
      },
    ]);
  });
});

describe("FileWorkItemsRepository", () => {
  it("shares story changes and rejects a stale writer across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "work-items.json");
    const human = new FileWorkItemsRepository(filePath);
    const agent = new FileWorkItemsRepository(filePath);

    const initial = await human.get();
    const story = await seedStory("S0.3");
    story.status = "in-progress";
    const humanEdit = await human.upsertStory(story, initial.revision);
    expect(humanEdit.changedIds).toEqual(["S0.3"]);

    expect(
      (await agent.get()).stories.find(({ id }) => id === "S0.3"),
    ).toMatchObject({ status: "in-progress" });

    await expect(
      agent.transitionStory("S0.3", "verify", initial.revision),
    ).rejects.toThrow(
      `Work-items revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
    expect((await human.get()).revision).toBe(initial.revision + 1);
  });

  it("persists review decisions, comments, and history across reloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "work-items.json");
    const repository = new FileWorkItemsRepository(
      filePath,
      () => "2026-07-18T20:00:00.000Z",
    );

    let document = await repository.get();
    document = (
      await repository.assignReview(
        "S1.0",
        { assignee: "Owner", gate: "decision:owner" },
        document.revision,
      )
    ).document;
    // Two reviews are pre-seeded, so the review assigned above is
    // review-S1.0-3 (document.reviews.length + 1 at assignment time).
    document = (
      await repository.decideReview(
        "review-S1.0-3",
        "changes-requested",
        "Owner",
        document.revision,
      )
    ).document;
    document = (
      await repository.addComment(
        {
          id: "comment-shape-decision",
          storyId: "S1.0",
          kind: "concern",
          author: "Owner",
          body: "The dedicated workspace decision needs one more pass.",
          createdAt: "2026-07-18T20:01:00.000Z",
        },
        document.revision,
      )
    ).document;

    const reloaded = await new FileWorkItemsRepository(filePath).get();
    expect(reloaded.revision).toBe(document.revision);
    expect(
      reloaded.reviews.find(({ id }) => id === "review-S1.0-3"),
    ).toMatchObject({
      decision: "changes-requested",
      unread: false,
      completed: true,
    });
    expect(reloaded.stories.find(({ id }) => id === "S1.0")).toMatchObject({
      reviewDecision: "changes-requested",
      decidedBy: "Owner",
    });
    expect(reloaded.comments).toHaveLength(1);
    expect(reloaded.history).toHaveLength(3);
    expect(reloaded.history[0]?.revision).toBe(2);
  });

  it("does not apply a stale mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileWorkItemsRepository(
      join(directory, "work.json"),
    );
    const initial = await repository.get();

    await repository.transitionStory("S0.3", "in-progress", initial.revision);

    await expect(
      repository.assignReview(
        "S0.3",
        { assignee: "Owner", gate: "peer" },
        initial.revision,
      ),
    ).rejects.toThrow(
      `Work-items revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
    // The rejected assignReview must not have appended a third review on top
    // of the two pre-seeded reviews.
    expect((await repository.get()).reviews).toHaveLength(2);
  });

  it("reaps a lock held by a dead process without waiting for the hard stale age", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileWorkItemsRepository(
      join(directory, "work.json"),
    );
    const initial = await repository.get();
    await writeFile(
      `${repository.filePath}.lock`,
      JSON.stringify({ pid: 999999, createdAt: Date.now() }),
      "utf8",
    );

    const result = await repository.transitionStory(
      "S0.3",
      "in-progress",
      initial.revision,
    );

    expect(result.document.revision).toBe(initial.revision + 1);
  });

  it("reaps an unparseable lock after the hard stale age", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileWorkItemsRepository(
      join(directory, "work.json"),
    );
    const initial = await repository.get();
    const lockPath = `${repository.filePath}.lock`;
    const old = new Date(Date.now() - 61_000);
    await writeFile(lockPath, "not-json", "utf8");
    await utimes(lockPath, old, old);

    const result = await repository.transitionStory(
      "S0.3",
      "in-progress",
      initial.revision,
    );

    expect(result.document.revision).toBe(initial.revision + 1);
  });

  it("reports a corrupt work-items store with its file path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-work-items-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileWorkItemsRepository(
      join(directory, "work.json"),
    );
    await writeFile(
      repository.filePath,
      JSON.stringify({
        revision: 1,
        stories: "not-an-array",
        comments: [],
        reviews: [],
        history: [],
      }),
      "utf8",
    );

    await expect(repository.get()).rejects.toThrow(
      new RegExp(`Work-items store is corrupt at .*${repository.filePath}`),
    );
  });
});
