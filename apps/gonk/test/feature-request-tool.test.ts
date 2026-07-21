import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth";
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository";
import { describe, expect, it, vi } from "vitest";

import { sigilApprovalProvider } from "../src/registry/approval.js";
import { registerFeatureRequestTools } from "../src/registry/feature-request.js";

function setup(options?: {
  auth?: AuthContext;
  host?: { resourceScope?: unknown; sessionScope?: unknown };
}) {
  const repository = new MemoryWorkItemsRepository();
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });
  registerFeatureRequestTools(registry, repository);
  const context = makeBaseContext({
    ...(options && "auth" in options
      ? { auth: options.auth }
      : { auth: allowedAuth() }),
    host: options?.host ?? {
      resourceScope: { tier: "workspace", id: "workspace-a" },
      sessionScope: "thread-a",
    },
  });
  return { context, registry, repository };
}

describe("feature request proposal tool", () => {
  it("requires explicit title and derives provenance from delegated human context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T22:10:00.000Z"));
    const authorize = vi.fn(() => ({
      outcome: "allow" as const,
      reason: "ok",
    }));
    const { context, registry, repository } = setup({
      auth: allowedAuth({ authorize }),
    });

    const result = await collectToolOutcome(
      registry.invoke(
        "sigil-feature-request-propose",
        {
          title: "Stable evidence card labels",
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
          title: "Stable evidence card labels",
          provenance: {
            origin: "agent",
            actorPrincipalId: "user-1",
            agentSessionId: "delegated-thread",
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

  it("blocks duplicate proposals by explicit title without emitting a domain outcome", async () => {
    const { context, registry, repository } = setup();
    await invokeProposal(registry, context, {
      title: "Stable evidence card labels",
      problem: "Evidence cards need stable labels.",
      desiredOutcome: "A card keeps the same visible label across turns.",
    });

    const duplicate = await invokeProposal(registry, context, {
      title: "stable evidence card label",
      problem: "Reworded problem text.",
      desiredOutcome: "Rewording cannot bypass the store policy.",
    });

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

  it("rejects caller-authored provenance, workflow state, and revision fields", async () => {
    const { context, registry, repository } = setup();
    const rejected = await invokeProposal(registry, context, {
      title: "Pin important citations",
      problem: "Pin important citations.",
      desiredOutcome: "Users can keep citation anchors visible.",
      actorPrincipalId: "attacker",
      status: "ready",
      expectedRevision: 0,
    });
    expect(rejected).toMatchObject({
      ok: false,
      message: "Input validation failed",
    });
    await expect(repository.get()).resolves.toMatchObject({ revision: 0 });
  });

  it("fails closed without auth, delegated human auth, or allow authorization", async () => {
    await expectRejectedWithoutMutation(setup({ auth: undefined }));
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          principal: servicePrincipal(),
        }),
      }),
      "delegated authenticated human principal",
    );
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          principal: humanPrincipal({ delegated: false }),
        }),
      }),
      "delegated authenticated human principal",
    );
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          authorize: allowRegistryThen(undefined as never),
        }),
      }),
      "not authorized",
    );
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          authorize: allowRegistryThen({ outcome: "deny", reason: "no" }),
        }),
      }),
      "not authorized",
    );
  });

  it("fails closed when input attempts to switch away from authenticated scope", async () => {
    await expectRejectedWithoutMutation(
      setup(),
      "cannot switch target scope",
      "workspace-b",
    );
    await expectRejectedWithoutMutation(
      setup(),
      "cannot switch target scope",
      "workspace:workspace-b",
    );
    await expectRejectedWithoutMutation(
      setup(),
      "cannot switch target scope",
      "project:project-a",
    );
  });

  it("accepts intended scope only when it matches the authenticated scope", async () => {
    const { context, registry } = setup();
    await expect(
      invokeProposal(registry, context, {
        title: "Matching intended scope",
        problem: "The user is explicit about the current workspace.",
        desiredOutcome: "The proposal stays in the authenticated workspace.",
        intendedScopeId: "workspace-a",
      }),
    ).resolves.toMatchObject({ ok: true, data: { outcome: "created" } });
  });
});

async function expectRejectedWithoutMutation(
  setupResult: ReturnType<typeof setup>,
  message?: string,
  intendedScopeId?: string,
) {
  const rejected = await invokeProposal(
    setupResult.registry,
    setupResult.context,
    {
      title: "Rejected proposal",
      problem: "This request should not be written.",
      desiredOutcome: "The repository remains unchanged.",
      ...(intendedScopeId ? { intendedScopeId } : {}),
    },
  );
  expect(rejected).toMatchObject({
    ok: false,
    ...(message ? { message: expect.stringContaining(message) } : {}),
  });
  await expect(setupResult.repository.get()).resolves.toMatchObject({
    revision: 0,
  });
}

function invokeProposal(
  registry: ToolRegistry,
  context: Parameters<ToolRegistry["invoke"]>[2],
  input: Record<string, unknown>,
) {
  return collectToolOutcome(
    registry.invoke("sigil-feature-request-propose", input, context),
  );
}

function allowedAuth(options?: {
  authorize?: AuthContext["authorize"];
  principal?: AuthenticatedPrincipal;
}): AuthContext {
  return {
    principal: options?.principal ?? humanPrincipal(),
    authorize:
      options?.authorize ??
      (() => ({
        outcome: "allow",
        reason: "test policy",
      })),
  };
}

function humanPrincipal(
  options: { delegated?: boolean } = { delegated: true },
): AuthenticatedPrincipal {
  return {
    id: "user-1",
    kind: "human",
    identity: {
      issuer: "sigil:test",
      subject: "user-1",
      method: "custom:test",
    },
    ...(options.delegated === false
      ? {}
      : {
          delegation: {
            actorKind: "agent" as const,
            actor: {
              issuer: "sigil:test",
              subject: "eve",
              method: "service-token" as const,
            },
            actorId: "agent:eve",
            actorSessionId: "delegated-thread",
          },
        }),
    roles: ["member"],
    scopes: ["workspace:workspace-a"],
  };
}

function servicePrincipal(): AuthenticatedPrincipal {
  return {
    id: "service:sigil-chat-agent",
    kind: "service",
    identity: {
      issuer: "sigil:test",
      subject: "sigil-chat-agent",
      method: "service-token",
    },
    roles: ["agent"],
    scopes: ["workspace:workspace-a"],
  };
}

function allowRegistryThen(
  applicationDecision: ReturnType<AuthContext["authorize"]>,
): AuthContext["authorize"] {
  return (request) =>
    request.action === "tool.discover" || request.action === "tool.invoke"
      ? { outcome: "allow", reason: "registry test policy" }
      : applicationDecision;
}
