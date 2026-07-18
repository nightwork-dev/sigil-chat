import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AuthContext } from "@gonk/auth";
import {
  FilesystemManagedSkillRegistry,
  type WritableManagedSkillRegistry,
} from "@gonk/skills";
import { collectToolOutcome, makeBaseContext } from "@gonk/tool-registry";
import { FileObjectStore } from "@mirk/artifact/fs";
import { FileGraphRepository } from "@workspace/graph-store/repository";
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SessionArtifactStore,
} from "../src/artifact-store.js";
import {
  createReviewDemoRepository,
  createSigilRegistry,
} from "../src/registry.js";
import { expectedRegistryToolContracts } from "./fixtures/registry-contract.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeRegistry(
  artifacts?: SessionArtifactStore,
  skillRegistry?: WritableManagedSkillRegistry,
) {
  const directory = await mkdtemp(join(tmpdir(), "sigil-chat-gonk-"));
  temporaryDirectories.push(directory);
  const repository = new FileGraphRepository(join(directory, "graph.json"));
  const reviewRepository = createReviewDemoRepository({
    now: () => "2026-07-16T12:00:00.000Z",
  });
  const workItemsRepository = new MemoryWorkItemsRepository({
    now: () => "2026-07-16T12:00:00.000Z",
  });
  return {
    registry: createSigilRegistry(
      repository,
      reviewRepository,
      workItemsRepository,
      artifacts,
      skillRegistry,
    ),
    repository,
    workItemsRepository,
  };
}

describe("Sigil Chat Gonk registry", () => {
  it("preserves discovery metadata, schemas, and ordered tool contracts", async () => {
    const { registry } = await makeRegistry();
    const contract = registry.list().map((tool) => {
      const schema = tool.inputJsonSchema as {
        type?: string;
        required?: string[];
        properties?: Record<string, unknown>;
        additionalProperties?: boolean;
      };
      return {
        name: tool.name,
        description: tool.description,
        visibility: tool.visibility,
        approval: tool.approval,
        schema: {
          type: schema.type,
          required: schema.required ?? [],
          properties: Object.keys(schema.properties ?? {}),
          additionalProperties: schema.additionalProperties,
        },
        mcpAnnotations: tool.hints?.mcp?.annotations,
      };
    });

    expect(contract).toEqual(expectedRegistryToolContracts);
    // No separate toHaveLength — the deep-equal above IS the full contract
    // snapshot; a hardcoded count is redundant and churns on every tool add.
  });

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

  it("lists and reads only files in the caller's session scope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-chat-files-"));
    temporaryDirectories.push(directory);
    const artifacts = new SessionArtifactStore(
      new FileObjectStore({ root: directory }),
    );
    const stored = await artifacts.putFile({
      bytes: new TextEncoder().encode("session notes"),
      filename: "notes.md",
      mediaType: "text/markdown",
      scope: "thread-a",
    });
    const { registry } = await makeRegistry(artifacts);

    const listed = await collectToolOutcome(
      registry.invoke(
        "sigil-list-session-files",
        {},
        makeBaseContext({ host: { sessionScope: "thread-a" } }),
      ),
    );
    expect(listed).toMatchObject({
      ok: true,
      data: { files: [{ id: stored.id, filename: "notes.md" }] },
    });

    const read = await collectToolOutcome(
      registry.invoke(
        "sigil-read-file",
        { id: stored.id },
        makeBaseContext({ host: { sessionScope: "thread-a" } }),
      ),
    );
    expect(read).toMatchObject({
      ok: true,
      data: { filename: "notes.md", content: "session notes" },
    });

    const otherSession = await collectToolOutcome(
      registry.invoke(
        "sigil-list-session-files",
        {},
        makeBaseContext({ host: { sessionScope: "thread-b" } }),
      ),
    );
    expect(otherSession).toMatchObject({ ok: true, data: { files: [] } });

    const leaked = await collectToolOutcome(
      registry.invoke(
        "sigil-read-file",
        { id: stored.id },
        makeBaseContext({ host: { sessionScope: "thread-b" } }),
      ),
    );
    expect(leaked).toMatchObject({
      ok: false,
      code: "INTERNAL",
      message: `Unknown file id for requested scope: ${stored.id}`,
    });
  });

  it("reads and mutates stories through the domain-outcome path", async () => {
    const { registry, workItemsRepository } = await makeRegistry();
    const listed = await collectToolOutcome(
      registry.invoke("sigil-story-list", {}, makeBaseContext()),
    );

    expect(listed).toMatchObject({
      ok: true,
      data: {
        revision: 0,
        stories: expect.arrayContaining([
          expect.objectContaining({ id: "S1.2", status: "ready" }),
        ]),
      },
    });

    const transition = await collectToolOutcome(
      registry.invoke(
        "sigil-story-transition",
        { id: "S1.2", status: "in-progress", expectedRevision: 0 },
        makeBaseContext(),
      ),
    );
    expect(transition).toMatchObject({
      ok: true,
      data: {
        changedIds: ["S1.2"],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "work-items.changed",
            resource: { kind: "work-items-board", id: "work-items" },
            operation: "story.transition",
            changedIds: ["S1.2"],
          },
        },
      },
    });

    const nextReviewId = `review-S1.2-${
      (await workItemsRepository.get()).reviews.length + 1
    }`;
    const assignment = await collectToolOutcome(
      registry.invoke(
        "sigil-story-assign-review",
        { id: "S1.2", gate: "peer", expectedRevision: 1 },
        makeBaseContext(),
      ),
    );
    expect(assignment).toMatchObject({
      ok: true,
      data: {
        changedIds: ["S1.2", nextReviewId],
        clientCommand: {
          payload: {
            kind: "work-items.changed",
            resource: { kind: "work-items-board", id: "work-items" },
            operation: "review.assign",
          },
        },
      },
    });
    await expect(workItemsRepository.get()).resolves.toMatchObject({
      revision: 2,
      reviews: expect.arrayContaining([
        expect.objectContaining({
          id: nextReviewId,
          assignee: "David",
          unread: true,
          completed: false,
        }),
      ]),
    });
  });

  it("round-trips a managed skill through the Gonk CRUD tools", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-chat-skills-"));
    temporaryDirectories.push(directory);
    const workspace = join(directory, "workspace");
    await mkdir(workspace);
    const skillRegistry = new FilesystemManagedSkillRegistry({
      env: {
        cwd: workspace,
        projectRoot: directory,
        homeRoot: join(directory, "home"),
        rootKinds: ["agents", ".agents", ".gonk"],
      },
      now: () => "2026-07-16T12:00:00.000Z",
    });
    const { registry } = await makeRegistry(undefined, skillRegistry);
    const auth: AuthContext = {
      principal: {
        id: "service:sigil-skill-test",
        kind: "service",
        identity: {
          issuer: "sigil:test",
          subject: "skill-agent",
          method: "service-token",
        },
        roles: ["agent"],
        scopes: [],
      },
      authorize: () => ({ outcome: "allow", reason: "test policy" }),
    };
    const context = makeBaseContext({ auth });

    const created = await collectToolOutcome(
      registry.invoke(
        "sigil-skill-upsert",
        {
          id: "roundtrip",
          scope: "project",
          description: "A skill used to verify the managed lifecycle.",
          body: "# Round trip\n\nInspect, create, and remove this skill.",
          idempotencyKey: "roundtrip-create",
        },
        context,
      ),
    );
    expect(created).toMatchObject({
      ok: true,
      data: {
        status: "ok",
        id: "roundtrip",
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "skills.changed",
            resource: { kind: "skills-catalog", id: "skills" },
            operation: "skill.upsert",
            changedIds: ["roundtrip"],
          },
        },
      },
    });

    const listed = await collectToolOutcome(
      registry.invoke("sigil-skill-list", { scope: "project" }, context),
    );
    expect(listed).toMatchObject({
      ok: true,
      data: {
        status: "ok",
        skills: [expect.objectContaining({ id: "roundtrip" })],
      },
    });

    const inspected = await collectToolOutcome(
      registry.invoke(
        "sigil-skill-get",
        { id: "roundtrip", scope: "project" },
        context,
      ),
    );
    expect(inspected).toMatchObject({
      ok: true,
      data: {
        status: "found",
        skill: {
          id: "roundtrip",
          body: "# Round trip\n\nInspect, create, and remove this skill.\n",
        },
      },
    });

    const revision =
      inspected.ok &&
      typeof inspected.data === "object" &&
      inspected.data !== null &&
      "skill" in inspected.data &&
      typeof inspected.data.skill === "object" &&
      inspected.data.skill !== null &&
      "revision" in inspected.data.skill &&
      typeof inspected.data.skill.revision === "string"
        ? inspected.data.skill.revision
        : undefined;
    expect(revision).toBeTruthy();
    if (!revision) throw new Error("Round-trip skill did not return a revision.");

    const deleted = await collectToolOutcome(
      registry.invoke(
        "sigil-skill-delete",
        {
          id: "roundtrip",
          scope: "project",
          expectedRevision: revision,
          idempotencyKey: "roundtrip-delete",
        },
        context,
      ),
    );
    expect(deleted).toMatchObject({
      ok: true,
      data: {
        status: "ok",
        id: "roundtrip",
        clientCommand: {
          payload: {
            kind: "skills.changed",
            operation: "skill.delete",
          },
        },
      },
    });
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

  it("exposes the complete draft article review document and adjacent passage context", async () => {
    const { registry } = await makeRegistry();
    const inspect = await collectToolOutcome(
      registry.invoke("sigil-review-inspect", {}, makeBaseContext()),
    );
    expect(inspect).toMatchObject({
      ok: true,
      data: {
        id: "draft-article-review",
        title: "Draft Article Review: A Technical Onboarding Guide",
      },
    });
    if (inspect.ok) {
      const data = inspect.data as {
        outline: Array<{ id: string; passageIds: string[] }>;
        passages: Array<{ id: string; sectionId: string }>;
      };
      expect(data.outline).toContainEqual(
        expect.objectContaining({
          id: "draft",
          passageIds: ["draft-01", "draft-02"],
        }),
      );
      expect(data.passages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "draft-02",
            sectionId: "draft",
          }),
          expect.objectContaining({
            id: "revise-01",
            sectionId: "closeout",
          }),
        ]),
      );
    }

    const adjacent = await collectToolOutcome(
      registry.invoke(
        "sigil-review-passages",
        { ids: ["draft-02", "revise-01"], before: 1, after: 1 },
        makeBaseContext(),
      ),
    );
    expect(adjacent).toMatchObject({
      ok: true,
      data: {
        requestedIds: ["draft-02", "revise-01"],
        passages: [
          { id: "draft-01" },
          { id: "draft-02" },
          { id: "factcheck-01" },
          { id: "revise-01" },
          { id: "publish-02" },
        ],
      },
    });
  });

  it("filters review decisions and annotations for multiple selected passages", async () => {
    const { registry } = await makeRegistry();
    const decisions = await collectToolOutcome(
      registry.invoke(
        "sigil-review-decisions",
        { passageIds: ["draft-02", "revise-01"], status: "open" },
        makeBaseContext(),
      ),
    );
    expect(decisions).toMatchObject({
      ok: true,
      data: {
        decisions: [
          { id: "decision-draft-owner" },
          { id: "decision-publish-authority" },
        ],
      },
    });

    const annotations = await collectToolOutcome(
      registry.invoke(
        "sigil-review-annotations",
        { ids: ["annotation-publish-inputs"] },
        makeBaseContext(),
      ),
    );
    expect(annotations).toMatchObject({
      ok: true,
      data: {
        annotations: [
          {
            id: "annotation-publish-inputs",
            passageIds: ["revise-01"],
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
              passageIds: ["draft-02"],
              kind: "note",
              body: "Link this check to the style guide's section-order rule.",
            },
            {
              id: "agent-publish-ownership",
              passageIds: ["revise-01", "publish-02"],
              kind: "flag",
              body: "Name the revision owner and publish approver.",
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
            id: "agent-publish-ownership",
            passageIds: ["revise-01", "publish-02"],
            author: "embedded-agent",
          },
        ],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "review.document.changed",
            operation: "annotations.add",
            changedIds: ["agent-annotation-1", "agent-publish-ownership"],
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
        "agent-publish-ownership",
      ]);
    }

    const after = await collectToolOutcome(
      registry.invoke(
        "sigil-review-annotations",
        { passageIds: ["publish-02"] },
        makeBaseContext(),
      ),
    );
    expect(after).toMatchObject({
      ok: true,
      data: { annotations: [{ id: "agent-publish-ownership" }] },
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
              id: "draft-01",
              expectedBody:
                "Rewrite the opening to lead with the reader's actual problem, not the history of the topic. Cut the throat-clearing paragraphs that come before the first concrete example.",
              body: "Rewrite the opening to lead with the reader's problem, not the topic's history.",
            },
            {
              id: "draft-02",
              body: "Walk each major section in the mistake/why/fix order and record which sections still skip the 'why' step.",
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
            id: "draft-01",
            body: "Rewrite the opening to lead with the reader's problem, not the topic's history.",
          },
          {
            id: "draft-02",
            body: "Walk each major section in the mistake/why/fix order and record which sections still skip the 'why' step.",
          },
        ],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "review.document.changed",
            operation: "passages.update",
            changedIds: ["draft-01", "draft-02"],
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
              id: "draft-01",
              expectedBody: "stale text",
              body: "This must not be applied.",
            },
            {
              id: "revise-01",
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
          id: "draft-01",
          expectedBody: "stale text",
          actualBody:
            "Rewrite the opening to lead with the reader's problem, not the topic's history.",
        },
      },
    });

    const after = await collectToolOutcome(
      registry.invoke(
        "sigil-review-passages",
        { ids: ["revise-01"] },
        makeBaseContext(),
      ),
    );
    expect(after).toMatchObject({
      ok: true,
      data: {
        passages: [
          {
            id: "revise-01",
            body: "If a section is cut, remove its cross-references, archive the removed prose in the revision history, and open a follow-up note for any claim the cut section was the only place substantiating.",
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
              targetIds: ["passage:draft-02", "passage:revise-01"],
              effect: "pulse",
            },
            {
              targetIds: ["decision:decision-publish-authority"],
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
                targetIds: ["passage:draft-02", "passage:revise-01"],
                effect: "pulse",
              },
              {
                targetIds: ["decision:decision-publish-authority"],
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
