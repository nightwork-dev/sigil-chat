import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry"
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository"
import type {
  ScopeBinding,
  Story,
  WorkItemsDocument,
} from "@workspace/work-items-store/types"
import { describe, expect, it, vi } from "vitest"

import { sigilApprovalProvider } from "../src/registry/approval.js"
import { registerSessionCommitmentTools } from "../src/registry/session-commitment.js"

function setup(options?: {
  auth?: AuthContext
  canAccessHome?: (input: {
    homeScopeId: string
    principalId: string
    workItemId: string
  }) => boolean | Promise<boolean>
  document?: WorkItemsDocument
}) {
  const repository = new MemoryWorkItemsRepository({
    document: options?.document ?? documentWithStories([story("S1", "home-a")]),
  })
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  })
  registerSessionCommitmentTools(
    registry,
    repository,
    options?.canAccessHome ?? (() => true),
  )
  const context = makeBaseContext({
    ...(options && "auth" in options
      ? { auth: options.auth }
      : { auth: allowedAuth() }),
  })
  return { context, registry, repository }
}

describe("session commitment tools", () => {
  it("fails closed without auth, delegated human Eve session, or channel metadata", async () => {
    await expectRejectedWithoutMutation(setup({ auth: undefined }))
    await expectRejectedWithoutMutation(
      setup({ auth: allowedAuth({ principal: servicePrincipal() }) }),
    )
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          principal: humanPrincipal({ delegated: false }),
        }),
      }),
    )
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          principal: humanPrincipal({ actorSession: false }),
        }),
      }),
    )
    await expectRejectedWithoutMutation(
      setup({
        auth: allowedAuth({
          principal: humanPrincipal({ channelId: undefined }),
        }),
      }),
    )
  })

  it("links, lists, and unlinks an authorized work item in the current session", async () => {
    const canAccessHome = vi.fn(() => true)
    const { context, registry, repository } = setup({
      canAccessHome,
    })

    const linked = await invoke(
      registry,
      context,
      "sigil-session-commitment-link",
      {
        workItemId: "S1",
        expectedRevision: 0,
      },
    )

    expect(canAccessHome).toHaveBeenCalledWith({
      homeScopeId: "home-a",
      principalId: "user-1",
      workItemId: "S1",
    })
    expect(linked).toMatchObject({
      ok: true,
      data: {
        outcome: "linked",
        applicationThreadId: "thread-a",
        sessionScopeId: "session:thread-a",
        changedIds: ["S1"],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "work-items.changed",
            operation: "session-commitment.link",
            changedIds: ["S1"],
          },
        },
        revision: 1,
        workItem: {
          id: "S1",
          status: "idea",
          scopeBindings: [
            { scopeId: "session:thread-a", relation: "mounted-in" },
          ],
        },
      },
    })
    expect(linked).not.toHaveProperty("data.document")

    const listed = await invoke(
      registry,
      context,
      "sigil-session-commitment-list",
      { expectedRevision: 1 },
    )
    expect(listed).toMatchObject({
      ok: true,
      data: {
        applicationThreadId: "thread-a",
        sessionScopeId: "session:thread-a",
        revision: 1,
        workItems: [{ id: "S1" }],
      },
    })

    const unlinked = await invoke(
      registry,
      context,
      "sigil-session-commitment-unlink",
      { workItemId: "S1", expectedRevision: 1 },
    )
    expect(unlinked).toMatchObject({
      ok: true,
      data: {
        outcome: "unlinked",
        changedIds: ["S1"],
        clientCommand: {
          type: "agent.domain.outcome",
          payload: {
            kind: "work-items.changed",
            operation: "session-commitment.unlink",
            changedIds: ["S1"],
          },
        },
        revision: 2,
        workItem: { id: "S1", scopeBindings: [] },
      },
    })
    expect(unlinked).not.toHaveProperty("data.document")
    await expect(repository.get()).resolves.toMatchObject({
      revision: 2,
      stories: [{ id: "S1", status: "idea", scopeBindings: [] }],
    })
  })

  it("keeps repeated link and unlink requests idempotent", async () => {
    const { context, registry, repository } = setup()

    const absent = await invoke(
      registry,
      context,
      "sigil-session-commitment-unlink",
      { workItemId: "S1", expectedRevision: 0 },
    )
    expect(absent).toMatchObject({
      ok: true,
      data: {
        outcome: "not-linked",
        changedIds: [],
        revision: 0,
      },
    })

    await invoke(registry, context, "sigil-session-commitment-link", {
      workItemId: "S1",
      expectedRevision: 0,
    })
    const duplicate = await invoke(
      registry,
      context,
      "sigil-session-commitment-link",
      { workItemId: "S1", expectedRevision: 1 },
    )

    expect(duplicate).toMatchObject({
      ok: true,
      data: {
        outcome: "already-linked",
        changedIds: [],
        revision: 1,
      },
    })
    await expect(repository.get()).resolves.toMatchObject({
      revision: 1,
      stories: [
        {
          scopeBindings: [
            { scopeId: "session:thread-a", relation: "mounted-in" },
          ],
        },
      ],
    })
  })

  it("isolates links by application thread", async () => {
    const { context, registry } = setup({
      document: documentWithStories([
        story("S1", "home-a", [
          { scopeId: "session:thread-b", relation: "mounted-in" },
        ]),
      ]),
    })

    const listed = await invoke(
      registry,
      context,
      "sigil-session-commitment-list",
      {},
    )

    expect(listed).toMatchObject({
      ok: true,
      data: { workItems: [] },
    })
  })

  it("hides listed work when home authorization has been revoked", async () => {
    const { context, registry } = setup({
      canAccessHome: () => false,
      document: documentWithStories([
        story("S1", "home-a", [
          { scopeId: "session:thread-a", relation: "mounted-in" },
        ]),
      ]),
    })

    const listed = await invoke(
      registry,
      context,
      "sigil-session-commitment-list",
      {},
    )

    expect(listed).toMatchObject({
      ok: true,
      data: { workItems: [] },
    })
  })

  it("denies link and unlink when the work item's home is unauthorized", async () => {
    const { context, registry, repository } = setup({
      canAccessHome: () => false,
      document: documentWithStories([
        story("S1", "home-a", [
          { scopeId: "session:thread-a", relation: "mounted-in" },
        ]),
      ]),
    })

    await expect(
      invoke(registry, context, "sigil-session-commitment-link", {
        workItemId: "S1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("not authorized"),
    })
    await expect(
      invoke(registry, context, "sigil-session-commitment-unlink", {
        workItemId: "S1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("not authorized"),
    })
    await expect(repository.get()).resolves.toMatchObject({ revision: 0 })
  })

  it("does not reveal whether a work item is absent or unauthorized", async () => {
    const denied = setup({
      canAccessHome: () => false,
    })
    const missing = setup()

    const deniedOutcome = await invoke(
      denied.registry,
      denied.context,
      "sigil-session-commitment-link",
      { workItemId: "S1" },
    )
    const missingOutcome = await invoke(
      missing.registry,
      missing.context,
      "sigil-session-commitment-link",
      { workItemId: "missing" },
    )

    expect(deniedOutcome).toMatchObject({
      ok: false,
      message: "Work item was not found or is not authorized.",
    })
    expect(missingOutcome).toMatchObject({
      ok: false,
      message: "Work item was not found or is not authorized.",
    })
  })

  it("removes only this session's exact mounted-in binding", async () => {
    const bindings: ScopeBinding[] = [
      { scopeId: "session:thread-a", relation: "mounted-in" },
      { scopeId: "session:thread-a", relation: "rolls-up-to" },
      { scopeId: "session:thread-b", relation: "mounted-in" },
      { scopeId: "workspace:other", relation: "mounted-in" },
    ]
    const { context, registry, repository } = setup({
      document: documentWithStories([story("S1", "home-a", bindings)]),
    })

    await invoke(registry, context, "sigil-session-commitment-unlink", {
      workItemId: "S1",
      expectedRevision: 0,
    })

    await expect(repository.get()).resolves.toMatchObject({
      revision: 1,
      stories: [
        {
          id: "S1",
          scopeBindings: [
            { scopeId: "session:thread-a", relation: "rolls-up-to" },
            { scopeId: "session:thread-b", relation: "mounted-in" },
            { scopeId: "workspace:other", relation: "mounted-in" },
          ],
        },
      ],
    })
  })

  it("refuses to unlink malformed duplicate session bindings", async () => {
    const duplicate = {
      scopeId: "session:thread-a",
      relation: "mounted-in" as const,
    }
    const { context, registry, repository } = setup({
      document: documentWithStories([
        story("S1", "home-a", [duplicate, duplicate]),
      ]),
    })

    await expect(
      invoke(registry, context, "sigil-session-commitment-unlink", {
        workItemId: "S1",
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("duplicate session commitment"),
    })
    await expect(repository.get()).resolves.toMatchObject({
      revision: 0,
      stories: [{ id: "S1", scopeBindings: [duplicate, duplicate] }],
    })
  })

  it("returns the repository revision conflict on stale link and unlink requests", async () => {
    const { context, registry, repository } = setup()
    await repository.upsertStory(story("S2", "home-a"))

    await expect(
      invoke(registry, context, "sigil-session-commitment-link", {
        workItemId: "S1",
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: "Work-items revision conflict: expected 0, current 1.",
    })
    await expect(
      invoke(registry, context, "sigil-session-commitment-unlink", {
        workItemId: "S1",
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: "Work-items revision conflict: expected 0, current 1.",
    })
  })
})

async function expectRejectedWithoutMutation(
  setupResult: ReturnType<typeof setup>,
) {
  await expect(
    invoke(
      setupResult.registry,
      setupResult.context,
      "sigil-session-commitment-list",
      {},
    ),
  ).resolves.toMatchObject({
    ok: false,
    message: expect.stringContaining("delegated authenticated human principal"),
  })
  await expect(setupResult.repository.get()).resolves.toMatchObject({
    revision: 0,
  })
}

function invoke(
  registry: ToolRegistry,
  context: Parameters<ToolRegistry["invoke"]>[2],
  toolName: string,
  input: Record<string, unknown>,
) {
  return collectToolOutcome(registry.invoke(toolName, input, context))
}

function allowedAuth(options?: {
  authorize?: AuthContext["authorize"]
  principal?: AuthenticatedPrincipal
}): AuthContext {
  return {
    principal: options?.principal ?? humanPrincipal(),
    authorize:
      options?.authorize ??
      (() => ({
        outcome: "allow",
        reason: "test policy",
      })),
  }
}

function humanPrincipal(
  options: {
    actorSession?: boolean
    channelId?: string
    delegated?: boolean
  } = {
    actorSession: true,
    channelId: "thread-a",
    delegated: true,
  },
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
            ...(options.actorSession === false
              ? {}
              : { actorSessionId: "eve-session-a" }),
            ...(options.channelId === undefined
              ? {}
              : { metadata: { channelId: options.channelId } }),
          },
        }),
    roles: ["member"],
    scopes: ["workspace:home-a"],
  }
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
    scopes: ["workspace:home-a"],
  }
}

function documentWithStories(stories: Story[]): WorkItemsDocument {
  return {
    revision: 0,
    stories,
    boardViews: [],
    comments: [],
    reviews: [],
    sponsorshipDecisions: [],
    history: [],
  }
}

function story(
  id: string,
  homeScopeId: string,
  scopeBindings: ScopeBinding[] = [],
): Story {
  return {
    id,
    kind: "story",
    homeScopeId,
    scopeBindings,
    provenance: {
      origin: "principal",
      actorPrincipalId: "user-1",
      createdAt: "2026-07-21T21:00:00.000Z",
    },
    revision: 1,
    epicId: "E1",
    epicTitle: "Session commitments",
    title: `Story ${id}`,
    intent: "Keep linked work visible in the session.",
    acceptanceCriteria: [],
    status: "idea",
    routing: "implementation",
    reviewGate: "none",
    deps: [],
    authoredBy: "user-1",
    createdAt: "2026-07-21T21:00:00.000Z",
    updatedAt: "2026-07-21T21:00:00.000Z",
  }
}
