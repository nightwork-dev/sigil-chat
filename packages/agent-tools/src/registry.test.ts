import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"
import { makeBaseContext } from "@gonk/tool-registry"
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository"
import { MemorySpecsRepository } from "@workspace/work-items-store/specs"
import { describe, expect, it } from "vitest"

import { createSigilAgentToolRegistry } from "./registry.js"

const hostDependencies = {
  artifacts: {} as never,
  containers: {
    projects: {} as never,
    workspaces: {} as never,
  },
  graph: {} as never,
  reviews: {} as never,
  skills: {} as never,
}

const expectedWorkItemToolNames = [
  "sigil-story-list",
  "sigil-story-inspect",
  "sigil-story-upsert",
  "sigil-story-transition",
  "sigil-story-assign-review",
  "sigil-story-comment",
  "sigil-feature-request-propose",
  "sigil-request-search",
  "sigil-request-inspect",
  "sigil-request-propose",
  "sigil-request-add-evidence",
  "sigil-spec-list",
  "sigil-spec-inspect",
  "sigil-spec-create",
  "sigil-spec-revise",
  "sigil-spec-transition",
]

describe("Sigil agent tool registry", () => {
  it("preserves current work-item tool names, schemas, visibility, and approval tiers", () => {
    const registry = createSigilAgentToolRegistry({
      ...hostDependencies,
      workItems: new MemoryWorkItemsRepository(),
      specs: new MemorySpecsRepository(),
    })
    const tools = registry.list()

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(expectedWorkItemToolNames),
    )
    for (const tool of tools.filter((candidate) =>
      expectedWorkItemToolNames.includes(candidate.name),
    )) {
      expect(tool.visibility).toBe("always")
      expect(tool.inputJsonSchema).toMatchObject({ type: "object" })
      expect(tool.handler).toEqual(expect.any(Function))
      expect(tool.description).toEqual(expect.any(String))
      expect(tool.description.length).toBeGreaterThan(20)
    }
    expect(registry.get("sigil-story-list")?.approval).toBe("read")
    expect(registry.get("sigil-request-search")?.approval).toBe("read")
    expect(registry.get("sigil-story-comment")?.approval).toBe("write")
    expect(registry.get("sigil-request-propose")?.approval).toBe("write")
    expect(registry.get("sigil-spec-create")?.approval).toBe("write")
  })

  it("proposes scoped requests through the injected work-items repository", async () => {
    const workItems = new MemoryWorkItemsRepository({
      now: () => "2026-07-22T12:00:00.000Z",
    })
    const registry = createSigilAgentToolRegistry({
      ...hostDependencies,
      workItems,
    })
    const result = await invokeResult(registry, "sigil-request-propose", {
      requestKind: "workflow",
      title: "Make native Eve tasking boring",
      problem: "Agents should not maintain a parallel todo/task substrate.",
      desiredOutcome:
        "Native Eve tools write durable Sigil work items through the shared repository.",
    })

    expect(result.outcome).toBe("created")
    expect(result.workItem.homeScopeId).toBe("sigil-chat")
    expect(result.workItem.request?.requestKind).toBe("workflow")
    expect(result.workItem.provenance.actorPrincipalId).toBe("human:owner")
    expect(result.workItem.provenance.agentSessionId).toBe("eve-session-1")
    expect(result.clientCommand.payload.kind).toBe("work-items.changed")

    const search = await workItems.searchRequests({
      homeScopeId: "sigil-chat",
      query: "tasking",
    })
    expect(search.requests.map(({ id }) => id)).toContain(result.workItem.id)
  })

  it("rejects attempts to task another scope from untrusted tool input", async () => {
    const registry = createSigilAgentToolRegistry({
      ...hostDependencies,
      workItems: new MemoryWorkItemsRepository(),
    })

    await expect(
      invokeResult(registry, "sigil-request-propose", {
        title: "Smuggle task",
        problem: "Tool input tries to switch the tasking scope.",
        desiredOutcome: "The host context wins.",
        intendedScopeId: "project:other",
      }),
    ).rejects.toThrow(
      "Request intake tools cannot switch target scope from the authenticated request scope.",
    )
  })
})

async function invokeResult(
  registry: ReturnType<typeof createSigilAgentToolRegistry>,
  name: string,
  input: unknown,
) {
  for await (const event of registry.invoke(
    name,
    input,
    makeBaseContext({
      auth: allowAllDelegatedHumanAuth(),
      host: { resourceScope: "project:sigil-chat" },
    }),
  )) {
    if (event.type === "result") return event.data as any
    if (event.type === "error") {
      throw new Error(event.message)
    }
  }
  throw new Error("No result event emitted.")
}

function allowAllDelegatedHumanAuth(): AuthContext {
  return {
    principal: delegatedHumanPrincipal(),
    authorize: () => ({
      outcome: "allow",
      reason: "test policy",
      policyId: "test",
    }),
  }
}

function delegatedHumanPrincipal(): AuthenticatedPrincipal {
  return {
    id: "human:owner",
    kind: "human",
    identity: {
      issuer: "test",
      subject: "owner",
      method: "local",
    },
    delegation: {
      actorKind: "agent",
      actor: {
        issuer: "test",
        subject: "eve",
        method: "local",
      },
      actorId: "agent:eve",
      actorSessionId: "eve-session-1",
    },
    roles: [],
    scopes: [],
  }
}
