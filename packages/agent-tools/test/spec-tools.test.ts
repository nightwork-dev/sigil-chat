import type { AuthContext } from "@gonk/auth";
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { MemorySpecsRepository } from "@workspace/work-items-store/specs";
import { describe, expect, it } from "vitest";

import { registerSpecTools } from "../src/spec.js";
import { sigilApprovalProvider } from "../src/approval.js";

const auth: AuthContext = {
  principal: {
    id: "agent:vesper",
    kind: "agent",
    identity: {
      issuer: "sigil:test",
      subject: "vesper",
      method: "service-token",
    },
    roles: ["agent"],
    scopes: [],
  },
  authorize: () => ({ outcome: "allow", reason: "test policy" }),
};

function setup() {
  const repository = new MemorySpecsRepository(
    [],
    () => "2026-07-21T21:15:00.000Z",
  );
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });
  registerSpecTools(registry, repository);
  return { repository, registry };
}

describe("roadmap spec tools", () => {
  it("creates a draft with host-derived authorship and reads it back", async () => {
    const { registry } = setup();
    const created = await collectToolOutcome(
      registry.invoke(
        "sigil-spec-create",
        {
          id: "SPEC.1",
          title: "Durable specifications",
          summary: "Make specs visible beside roadmap work.",
          body: "The durable contract.\n\n## Behavior\n\nSpecs link to stories.",
          storyIds: ["S1.10"],
          expectedRevision: 0,
        },
        makeBaseContext({ auth }),
      ),
    );
    expect(created).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        spec: { status: "draft", authoredBy: "agent:vesper" },
        clientCommand: {
          payload: { kind: "roadmap-specs.changed", operation: "spec.create" },
        },
      },
    });

    const inspected = await collectToolOutcome(
      registry.invoke(
        "sigil-spec-inspect",
        { id: "SPEC.1", expectedRevision: 1 },
        makeBaseContext(),
      ),
    );
    expect(inspected).toMatchObject({
      ok: true,
      data: { revision: 1, spec: { storyIds: ["S1.10"] } },
    });
  });

  it("rejects a duplicate create and stale revision", async () => {
    const { registry } = setup();
    const input = {
      id: "SPEC.1",
      title: "Durable specifications",
      summary: "Make specs visible beside roadmap work.",
      body: "The durable contract.",
    };
    await collectToolOutcome(
      registry.invoke("sigil-spec-create", input, makeBaseContext({ auth })),
    );

    await expect(
      collectToolOutcome(
        registry.invoke("sigil-spec-create", input, makeBaseContext({ auth })),
      ),
    ).resolves.toMatchObject({
      ok: false,
      message: "Spec id already exists: SPEC.1.",
    });
    await expect(
      collectToolOutcome(
        registry.invoke(
          "sigil-spec-revise",
          { id: "SPEC.1", summary: "Stale", expectedRevision: 0 },
          makeBaseContext(),
        ),
      ),
    ).resolves.toMatchObject({
      ok: false,
      message: "Specs revision conflict: expected 0, current 1.",
    });
  });
});
