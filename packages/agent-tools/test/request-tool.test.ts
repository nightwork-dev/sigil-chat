import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth";
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository";
import { describe, expect, it, vi } from "vitest";

import { sigilApprovalProvider } from "../src/approval.js";
import { registerRequestTools } from "../src/request.js";

function setup(options?: {
  auth?: AuthContext;
  host?: { resourceScope?: unknown };
}) {
  const repository = new MemoryWorkItemsRepository();
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });
  registerRequestTools(registry, repository);
  const context = makeBaseContext({
    ...(options && "auth" in options
      ? { auth: options.auth }
      : { auth: allowedAuth() }),
    host: options?.host ?? {
      resourceScope: { tier: "workspace", id: "workspace-a" },
    },
  });
  return { context, registry, repository };
}

describe("request intake tools", () => {
  it("proposes generalized requests with structured after-action evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T03:00:00.000Z"));
    const { context, registry } = setup();

    const result = await collectToolOutcome(
      registry.invoke(
        "sigil-request-propose",
        {
          requestKind: "tool",
          title: "Append request evidence",
          problem: "Duplicate request encounters lose task evidence.",
          desiredOutcome:
            "Repeated encounters strengthen one canonical request.",
          originMode: "after-action",
          structuredEvidence: [
            {
              constraint: "Only creation was available.",
              workaround: "The agent would create another request.",
              cost: "Roadmap triage gets duplicate noise.",
              expectedImprovement:
                "The agent can append evidence to an existing request.",
              proof: "The request has an evidence entry.",
            },
          ],
        },
        context,
      ),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        outcome: "created",
        workItem: {
          id: "FR.1",
          request: {
            requestKind: "tool",
            requestState: "proposed",
            evidence: [
              {
                observedById: "agent:eve",
                observedByKind: "agent",
                constraint: "Only creation was available.",
              },
            ],
          },
          provenance: {
            actorPrincipalId: "user-1",
            requesterId: "agent:eve",
            requesterKind: "agent",
            originMode: "after-action",
            agentSessionId: "delegated-thread",
          },
        },
        clientCommand: {
          payload: {
            kind: "work-items.changed",
            operation: "request.propose",
            changedIds: ["FR.1"],
          },
        },
      },
    });
    vi.useRealTimers();
  });

  it("searches requests and appends evidence to a match", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T03:10:00.000Z"));
    const { context, registry } = setup();
    await collectToolOutcome(
      registry.invoke(
        "sigil-request-propose",
        {
          requestKind: "workflow",
          title: "Preserve after-action constraints",
          problem: "After-action notes are not durable.",
          desiredOutcome: "The agent can file reusable request evidence.",
        },
        context,
      ),
    );

    await expect(
      collectToolOutcome(
        registry.invoke(
          "sigil-request-search",
          { filter: { requestKind: "workflow", query: "after-action" } },
          context,
        ),
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { requests: [{ id: "FR.1" }] },
    });

    const appended = await collectToolOutcome(
      registry.invoke(
        "sigil-request-add-evidence",
        {
          requestId: "FR.1",
          evidence: {
            constraint: "A second task hit the same gap.",
            workaround: "Manual narrative only.",
            cost: "The evidence was easy to lose.",
            expectedImprovement: "Append evidence to FR.1.",
            taskRef: "S1.11",
          },
        },
        context,
      ),
    );

    expect(appended).toMatchObject({
      ok: true,
      data: {
        changedIds: ["FR.1", "evidence-1"],
        clientCommand: {
          payload: {
            operation: "request.evidence.add",
            changedIds: ["FR.1", "evidence-1"],
          },
        },
      },
    });
    vi.useRealTimers();
  });

  it("does not leak cross-scope requests through search", async () => {
    const { context, registry, repository } = setup();
    await seedRequest(repository, {
      currentScopeId: "workspace-b",
      title: "Hidden workspace evidence intake",
    });

    await expect(
      collectToolOutcome(
        registry.invoke(
          "sigil-request-search",
          { filter: { homeScopeId: "workspace-b", query: "Hidden" } },
          context,
        ),
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { requests: [] },
    });

    await expect(
      collectToolOutcome(
        registry.invoke(
          "sigil-request-search",
          { filter: { query: "Hidden workspace" } },
          context,
        ),
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { requests: [] },
    });
  });

  it("makes unknown and cross-scope inspect failures opaque", async () => {
    const { context, registry, repository } = setup();
    await seedRequest(repository, {
      currentScopeId: "workspace-b",
      title: "Hidden inspect request",
    });

    const hidden = await collectToolOutcome(
      registry.invoke("sigil-request-inspect", { id: "FR.1" }, context),
    );
    const unknown = await collectToolOutcome(
      registry.invoke("sigil-request-inspect", { id: "FR.999" }, context),
    );

    expect(hidden).toMatchObject({
      ok: false,
      message: "Request was not found.",
    });
    expect(unknown).toEqual(hidden);
  });

  it("authorizes the current scope before opaque evidence lookup", async () => {
    const { context, registry, repository } = setup();
    await seedRequest(repository, {
      currentScopeId: "workspace-b",
      title: "Hidden evidence request",
    });

    const hidden = await addEvidence(registry, context, "FR.1");
    const unknown = await addEvidence(registry, context, "FR.999");

    expect(hidden).toMatchObject({
      ok: false,
      message: "Request was not found.",
    });
    expect(unknown).toEqual(hidden);
    await expect(repository.get()).resolves.toMatchObject({ revision: 1 });
  });
});

async function addEvidence(
  registry: ToolRegistry,
  context: Parameters<ToolRegistry["invoke"]>[2],
  requestId: string,
) {
  return collectToolOutcome(
    registry.invoke(
      "sigil-request-add-evidence",
      {
        requestId,
        evidence: {
          constraint: "Repeated task cannot attach evidence.",
          workaround: "Manual note.",
          cost: "The request strength is hidden.",
          expectedImprovement: "Evidence appends to the canonical request.",
        },
      },
      context,
    ),
  );
}

async function seedRequest(
  repository: MemoryWorkItemsRepository,
  input: { currentScopeId: string; title: string },
) {
  return repository.proposeFeatureRequest(
    {
      requestKind: "workflow",
      title: input.title,
      problem: "A hidden workspace has a durable request.",
      desiredOutcome: "Unauthorized callers cannot infer its existence.",
    },
    {
      actorPrincipalId: "user-hidden",
      requesterId: "user-hidden",
      requesterKind: "human",
      originMode: "human-direct",
      currentScopeId: input.currentScopeId,
      now: "2026-07-22T03:30:00.000Z",
    },
  );
}

function allowedAuth(): AuthContext {
  return {
    principal: humanPrincipal(),
    authorize: () => ({
      outcome: "allow",
      reason: "test policy",
    }),
  };
}

function humanPrincipal(): AuthenticatedPrincipal {
  return {
    id: "user-1",
    kind: "human",
    identity: {
      issuer: "sigil:test",
      subject: "user-1",
      method: "custom:test",
    },
    delegation: {
      actorKind: "agent",
      actor: {
        issuer: "sigil:test",
        subject: "eve",
        method: "service-token",
      },
      actorId: "agent:eve",
      actorSessionId: "delegated-thread",
    },
    roles: ["member"],
    scopes: ["workspace:workspace-a"],
  };
}
