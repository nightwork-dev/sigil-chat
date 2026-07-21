import type { AuthContext } from "@gonk/auth";
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository";
import { describe, expect, it, vi } from "vitest";

import { sigilApprovalProvider } from "../src/registry/approval.js";
import { registerFeatureRequestTools } from "../src/registry/feature-request.js";

function setup(auth: AuthContext = allowedAuth()) {
  const repository = new MemoryWorkItemsRepository();
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });
  registerFeatureRequestTools(registry, repository);
  if (!registry.has("sigil-feature-request-propose")) {
    throw new Error(
      `Feature request tool was not registered. Registered: ${registry
        .list()
        .map((tool) => tool.name)
        .join(", ")}`,
    );
  }
  const context = makeBaseContext({
    auth,
    host: {
      resourceScope: { tier: "workspace", id: "workspace-a" },
      sessionScope: "thread-a",
    },
  });
  return { context, registry, repository };
}

describe("feature request proposal tool", () => {
  it("derives provenance and writes only an idea-stage feature request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T22:10:00.000Z"));
    const authorize = vi.fn(() => ({
      outcome: "allow" as const,
      reason: "ok",
    }));
    const { context, registry, repository } = setup(allowedAuth(authorize));

    const result = await collectToolOutcome(
      registry.invoke(
        "sigil-feature-request-propose",
        {
          problem: "Evidence cards need stable labels.",
          desiredOutcome: "A card keeps the same visible label across turns.",
          evidence: ["The current session has three ambiguous evidence cards."],
          sourceRefs: ["artifact:evidence-1"],
          proposedSponsorPrincipalId: "user-sponsor",
        },
        context,
      ),
    );

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "application:scope.tool",
        resource: expect.objectContaining({
          kind: "application:scope",
          target: "workspace:workspace-a",
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        outcome: "created",
        changedIds: ["FR.1"],
        workItem: {
          id: "FR.1",
          kind: "feature-request",
          homeScopeId: "workspace-a",
          status: "idea",
          provenance: {
            origin: "agent",
            actorPrincipalId: "user-1",
            agentSessionId: "thread-a",
            proposedSponsorPrincipalId: "user-sponsor",
            sourceRefs: ["artifact:evidence-1"],
            createdAt: "2026-07-21T22:10:00.000Z",
          },
        },
        clientCommand: {
          payload: {
            kind: "work-items.changed",
            operation: "feature-request.propose",
            changedIds: ["FR.1"],
          },
        },
      },
    });
    await expect(repository.listSponsorshipDecisions()).resolves.toEqual([]);
    vi.useRealTimers();
  });

  it("blocks duplicate proposals without emitting a domain outcome", async () => {
    const { context, registry, repository } = setup();
    await collectToolOutcome(
      registry.invoke(
        "sigil-feature-request-propose",
        {
          problem: "Evidence cards need stable labels.",
          desiredOutcome: "A card keeps the same visible label across turns.",
        },
        context,
      ),
    );

    const duplicate = await collectToolOutcome(
      registry.invoke(
        "sigil-feature-request-propose",
        {
          problem: "evidence cards need stable label",
          desiredOutcome: "Rewording cannot bypass the store policy.",
        },
        context,
      ),
    );

    expect(duplicate).toMatchObject({
      ok: true,
      data: {
        outcome: "duplicate",
        changedIds: [],
        candidates: [{ workItem: { id: "FR.1" } }],
      },
    });
    expect(duplicate.ok && duplicate.data).not.toHaveProperty("clientCommand");
    await expect(repository.get()).resolves.toMatchObject({ revision: 1 });
  });

  it("rejects caller-authored provenance and workflow state fields", async () => {
    const { context, registry, repository } = setup();
    const rejected = await collectToolOutcome(
      registry.invoke(
        "sigil-feature-request-propose",
        {
          problem: "Pin important citations.",
          desiredOutcome: "Users can keep citation anchors visible.",
          actorPrincipalId: "attacker",
          status: "ready",
        },
        context,
      ),
    );
    expect(rejected).toMatchObject({
      ok: false,
      message: "Input validation failed",
    });
    await expect(repository.get()).resolves.toMatchObject({ revision: 0 });
  });
});

function allowedAuth(
  authorize: AuthContext["authorize"] = () => ({
    outcome: "allow",
    reason: "test policy",
  }),
): AuthContext {
  return {
    principal: {
      id: "user-1",
      kind: "human",
      identity: {
        issuer: "sigil:test",
        subject: "user-1",
        method: "custom:test",
      },
      roles: ["member"],
      scopes: ["workspace:workspace-a"],
    },
    authorize,
  };
}
