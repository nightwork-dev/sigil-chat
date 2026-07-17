import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AuthContext } from "@gonk/auth";
import { collectToolOutcome, makeBaseContext } from "@gonk/tool-registry";
import { FileGraphRepository } from "@workspace/graph-store/repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReviewDemoRepository,
  createSigilRegistry,
} from "../src/registry.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeRegistry() {
  const directory = await mkdtemp(join(tmpdir(), "sigil-chat-gonk-"));
  temporaryDirectories.push(directory);
  const repository = new FileGraphRepository(join(directory, "graph.json"));
  const reviewRepository = createReviewDemoRepository({
    now: () => "2026-07-16T12:00:00.000Z",
  });
  return {
    registry: createSigilRegistry(repository, reviewRepository),
    repository,
  };
}

describe("Sigil Chat Gonk registry", () => {
  it("runs an authenticated write through Sigil's registry approval provider", async () => {
    const { registry } = await makeRegistry();
    const auth: AuthContext = {
      principal: {
        id: "service:sigil-test",
        kind: "service",
        identity: {
          issuer: "sigil:test",
          subject: "agent",
          method: "service-token",
        },
        roles: ["agent"],
        scopes: [],
      },
      authorize: () => ({ outcome: "allow", reason: "test policy" }),
    };

    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-update-node",
        { id: "budget", label: "Approved", expectedRevision: 0 },
        makeBaseContext({ auth }),
      ),
    );

    expect(outcome).toMatchObject({ ok: true, data: { revision: 1 } });
  });

  it("rejects unknown tools with a structured not-found error", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke("sigil-does-not-exist", {}, makeBaseContext()),
    );

    expect(outcome).toEqual({
      ok: false,
      code: "TOOL_NOT_FOUND",
      message: "No such tool: sigil-does-not-exist",
    });
  });

  it("rejects a write with an unknown reducer id", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-add-node",
        { reducerId: "missing.reducer" },
        makeBaseContext(),
      ),
    );

    expect(outcome).toEqual({
      ok: false,
      code: "INTERNAL",
      message: 'Unknown reducer "missing.reducer".',
    });
  });

  it("rejects a stale write with the revision-conflict error", async () => {
    const { registry } = await makeRegistry();
    await collectToolOutcome(
      registry.invoke(
        "sigil-graph-update-node",
        { id: "budget", label: "Envelope", expectedRevision: 0 },
        makeBaseContext(),
      ),
    );

    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-update-node",
        { id: "budget", label: "Stale", expectedRevision: 0 },
        makeBaseContext(),
      ),
    );

    expect(outcome).toEqual({
      ok: false,
      code: "INTERNAL",
      message: "Graph revision conflict: expected 0, found 1.",
    });
  });

  it("rejects malformed input before the write handler runs", async () => {
    const { registry, repository } = await makeRegistry();
    const get = vi.spyOn(repository, "get");
    const wrongType = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-add-node",
        { reducerId: 42 },
        makeBaseContext(),
      ),
    );
    const missingRequiredField = await collectToolOutcome(
      registry.invoke("sigil-graph-add-node", {}, makeBaseContext()),
    );

    for (const outcome of [wrongType, missingRequiredField]) {
      expect(outcome).toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
        message: "Input validation failed",
        details: [{ message: "Expected an object with a string reducerId." }],
      });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("exposes live runtime status through canonical Gonk dispatch", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke("sigil-chat-status", {}, makeBaseContext()),
    );

    expect(outcome).toMatchObject({
      ok: true,
      data: {
        application: "sigil-chat",
        agentRuntime: "eve",
        toolRegistry: "gonk",
        transport: "mcp-streamable-http",
      },
    });
    if (outcome.ok) {
      expect((outcome.data as { serverTime: string }).serverTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
    }
  });

  it("lets an agent inspect and mutate the same reducer graph repository", async () => {
    const { registry, repository } = await makeRegistry();
    const inspect = await collectToolOutcome(
      registry.invoke("sigil-graph-inspect", {}, makeBaseContext()),
    );

    expect(inspect).toMatchObject({
      ok: true,
      data: {
        document: { id: "launch-budget", revision: 0 },
        run: { outputs: { remaining: { difference: 92 } } },
      },
    });

    const update = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-update-node",
        { id: "budget", inputValues: { value: 140 }, expectedRevision: 0 },
        makeBaseContext(),
      ),
    );

    expect(update).toMatchObject({ ok: true, data: { revision: 1 } });
    const sharedRun = await repository.run();
    expect(sharedRun.outputs.remaining?.difference).toBe(112);
  });

  it("exposes reducer schemas and applies a planned batch atomically", async () => {
    const { registry } = await makeRegistry();
    const catalog = await collectToolOutcome(
      registry.invoke(
        "sigil-reducer-catalog",
        { reducerId: "constraint.clamp" },
        makeBaseContext(),
      ),
    );
    expect(catalog).toMatchObject({
      ok: true,
      data: {
        reducers: [
          {
            id: "constraint.clamp",
            constraints: ["minimum must be less than or equal to maximum"],
            inputs: [
              { name: "value", kind: "number", defaultValue: 0 },
              { name: "minimum", kind: "number", defaultValue: 0 },
              { name: "maximum", kind: "number", defaultValue: 100 },
            ],
          },
        ],
      },
    });

    const commands = [
      {
        type: "node.update",
        id: "budget",
        patch: { inputValues: { value: 150 } },
      },
      {
        type: "node.update",
        id: "design",
        patch: { inputValues: { value: 30 } },
      },
    ];
    const plan = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-plan",
        { commands, expectedRevision: 0 },
        makeBaseContext(),
      ),
    );
    expect(plan).toMatchObject({
      ok: true,
      data: {
        valid: true,
        proposedRevision: 1,
        run: { outputs: { remaining: { difference: 120 } } },
      },
    });

    const commit = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-apply-batch",
        { commands, expectedRevision: 0 },
        makeBaseContext(),
      ),
    );
    expect(commit).toMatchObject({
      ok: true,
      data: { applied: true, document: { revision: 1 } },
    });
  });

  it("applies heterogeneous graph edits through one agent tool call", async () => {
    const { registry, repository } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-graph-edit",
        {
          expectedRevision: 0,
          actions: [
            {
              type: "add-node",
              reducerId: "value.number",
              id: "batch-left",
              label: "Batch left",
              inputValues: { value: 2 },
            },
            {
              type: "add-node",
              reducerId: "value.number",
              id: "batch-right",
              label: "Batch right",
              inputValues: { value: 3 },
            },
            {
              type: "add-node",
              reducerId: "math.add",
              id: "batch-sum",
              label: "Batch sum",
            },
            {
              type: "connect",
              sourceNodeId: "batch-left",
              sourceSocket: "value",
              targetNodeId: "batch-sum",
              targetSocket: "a",
            },
            {
              type: "connect",
              sourceNodeId: "batch-right",
              sourceSocket: "value",
              targetNodeId: "batch-sum",
              targetSocket: "b",
            },
          ],
        },
        makeBaseContext(),
      ),
    );

    expect(outcome).toMatchObject({
      ok: true,
      data: {
        applied: true,
        document: { revision: 1 },
        plan: {
          valid: true,
          diff: {
            nodes: { added: ["batch-left", "batch-right", "batch-sum"] },
          },
        },
      },
    });
    expect((await repository.run()).outputs["batch-sum"]?.sum).toBe(5);
  });

  it("exposes the complete LiveOps review document and adjacent passage context", async () => {
    const { registry } = await makeRegistry();
    const inspect = await collectToolOutcome(
      registry.invoke("sigil-review-inspect", {}, makeBaseContext()),
    );
    expect(inspect).toMatchObject({
      ok: true,
      data: {
        id: "weekly-tournament-liveops",
        title: "Weekly Tournament LiveOps Runbook",
      },
    });
    if (inspect.ok) {
      const data = inspect.data as {
        outline: Array<{ id: string; passageIds: string[] }>;
        passages: Array<{ id: string; sectionId: string }>;
      };
      expect(data.outline).toContainEqual(
        expect.objectContaining({
          id: "preflight",
          passageIds: ["preflight-01", "preflight-02"],
        }),
      );
      expect(data.passages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "preflight-02",
            sectionId: "preflight",
          }),
          expect.objectContaining({
            id: "rollback-01",
            sectionId: "closeout",
          }),
        ]),
      );
    }

    const adjacent = await collectToolOutcome(
      registry.invoke(
        "sigil-review-passages",
        { ids: ["preflight-02", "rollback-01"], before: 1, after: 1 },
        makeBaseContext(),
      ),
    );
    expect(adjacent).toMatchObject({
      ok: true,
      data: {
        requestedIds: ["preflight-02", "rollback-01"],
        passages: [
          { id: "preflight-01" },
          { id: "preflight-02" },
          { id: "monitoring-01" },
          { id: "rollback-01" },
          { id: "closeout-02" },
        ],
      },
    });
  });

  it("filters review decisions and annotations for multiple selected passages", async () => {
    const { registry } = await makeRegistry();
    const decisions = await collectToolOutcome(
      registry.invoke(
        "sigil-review-decisions",
        { passageIds: ["preflight-02", "rollback-01"], status: "open" },
        makeBaseContext(),
      ),
    );
    expect(decisions).toMatchObject({
      ok: true,
      data: {
        decisions: [
          { id: "decision-preflight-owner" },
          { id: "decision-rollback-authority" },
        ],
      },
    });

    const annotations = await collectToolOutcome(
      registry.invoke(
        "sigil-review-annotations",
        { ids: ["annotation-rollback-inputs"] },
        makeBaseContext(),
      ),
    );
    expect(annotations).toMatchObject({
      ok: true,
      data: {
        annotations: [
          {
            id: "annotation-rollback-inputs",
            passageIds: ["rollback-01"],
            kind: "question",
          },
        ],
      },
    });
  });

  it("adds multiple agent annotations with read-after-write and a client command", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-review-add-annotation",
        {
          annotations: [
            {
              passageIds: ["preflight-02"],
              kind: "note",
              body: "Link this check to the regional certification artifact.",
            },
            {
              id: "agent-rollback-ownership",
              passageIds: ["rollback-01", "closeout-02"],
              kind: "flag",
              body: "Name the rollback owner and closeout approver.",
              author: "embedded-agent",
            },
          ],
        },
        makeBaseContext(),
      ),
    );
    expect(outcome).toMatchObject({
      ok: true,
      data: {
        annotations: [
          {
            id: "agent-annotation-1",
            author: "agent",
            createdAt: "2026-07-16T12:00:00.000Z",
          },
          {
            id: "agent-rollback-ownership",
            passageIds: ["rollback-01", "closeout-02"],
            author: "embedded-agent",
          },
        ],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "review.document.changed",
            operation: "annotations.add",
            changedIds: [
              "agent-annotation-1",
              "agent-rollback-ownership",
            ],
          },
        },
      },
    });
    if (outcome.ok) {
      const data = outcome.data as {
        clientCommand: {
          payload: { changedIds: string[] };
        };
      };
      expect(data.clientCommand.payload.changedIds).toEqual([
        "agent-annotation-1",
        "agent-rollback-ownership",
      ]);
    }

    const after = await collectToolOutcome(
      registry.invoke(
        "sigil-review-annotations",
        { passageIds: ["closeout-02"] },
        makeBaseContext(),
      ),
    );
    expect(after).toMatchObject({
      ok: true,
      data: { annotations: [{ id: "agent-rollback-ownership" }] },
    });
  });

  it("atomically edits multiple review passages with conflict guards", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-review-update-passages",
        {
          passages: [
            {
              id: "preflight-01",
              expectedBody:
                "Confirm the tournament is visible in every active region and that the published start time resolves correctly in each supported locale.",
              body: "Confirm tournament visibility and localized start times in every active region.",
            },
            {
              id: "preflight-02",
              body: "Run the synthetic entry flow in every active region and record the resulting bracket id.",
            },
          ],
        },
        makeBaseContext(),
      ),
    );
    expect(outcome).toMatchObject({
      ok: true,
      data: {
        passages: [
          {
            id: "preflight-01",
            body: "Confirm tournament visibility and localized start times in every active region.",
          },
          {
            id: "preflight-02",
            body: "Run the synthetic entry flow in every active region and record the resulting bracket id.",
          },
        ],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "review.document.changed",
            operation: "passages.update",
            changedIds: ["preflight-01", "preflight-02"],
          },
        },
      },
    });

    const stale = await collectToolOutcome(
      registry.invoke(
        "sigil-review-update-passages",
        {
          passages: [
            {
              id: "preflight-01",
              expectedBody: "stale text",
              body: "This must not be applied.",
            },
            {
              id: "rollback-01",
              body: "This must also not be applied.",
            },
          ],
        },
        makeBaseContext(),
      ),
    );
    expect(stale).toMatchObject({
      ok: true,
      data: {
        applied: false,
        conflict: {
          kind: "passage",
          id: "preflight-01",
          expectedBody: "stale text",
          actualBody:
            "Confirm tournament visibility and localized start times in every active region.",
        },
      },
    });

    const after = await collectToolOutcome(
      registry.invoke(
        "sigil-review-passages",
        { ids: ["rollback-01"] },
        makeBaseContext(),
      ),
    );
    expect(after).toMatchObject({
      ok: true,
      data: {
        passages: [
          {
            id: "rollback-01",
            body: "If rollback is declared, disable new enrollment, restore the last known-good configuration revision, preserve affected account ids, and open a reward-reconciliation plan before event closeout.",
          },
        ],
      },
    });
  });

  it("returns semantic multi-target UI highlight commands without selectors", async () => {
    const { registry } = await makeRegistry();
    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-ui-highlight",
        {
          clearPrevious: false,
          actions: [
            {
              targetIds: ["passage:preflight-02", "passage:rollback-01"],
              effect: "pulse",
            },
            {
              targetIds: ["decision:decision-rollback-authority"],
              effect: "focus",
            },
          ],
        },
        makeBaseContext(),
      ),
    );
    expect(outcome).toMatchObject({
      ok: true,
      data: {
        clientCommand: {
          type: "ui.highlight",
          payload: {
            clearPrevious: false,
            actions: [
              {
                targetIds: ["passage:preflight-02", "passage:rollback-01"],
                effect: "pulse",
              },
              {
                targetIds: ["decision:decision-rollback-authority"],
                effect: "focus",
              },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("selector");
  });
});
