import type { KvStore } from "@gonk/store/types"
import { createSignedDelegationProvider } from "@gonk/eve-host/guard"
import { afterEach, describe, expect, it } from "vitest"
import { passthrough, ToolRegistry } from "@gonk/tool-registry"
import {
  SIGIL_GONK_DELEGATION_AUDIENCE,
  SIGIL_GONK_DELEGATION_ISSUER,
} from "@workspace/agent-contracts/gonk-turn-delegation"
import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository"

import { ProjectRegistry } from "../../agent/agent/lib/project-registry.js"
import { ScopeGrantRegistry } from "../../agent/agent/lib/scope-grant-registry.js"
import { ProjectWorkspaceScopeRegistry } from "../../agent/agent/lib/scope-registry.js"
import { WorkspaceRegistry } from "../../agent/agent/lib/workspace-registry.js"
import { createAgentMcpBearerHeaders } from "@zigil/agent-gonk"

import { createSigilMcpHandler } from "../src/mcp-handler.js"
import { MirkAgentThreadScopeOwnerRegistry } from "../../agent/agent/lib/agent-thread-scope-owners.js"
import {
  authenticateEveTurnDelegation,
  createContainerScopeAuthorizationPolicy,
} from "../src/auth.js"
import { sigilApprovalProvider } from "../src/registry/approval.js"
import { registerFeatureRequestTools } from "../src/registry/feature-request.js"

const token = "sigil-server-boundary-token-32bytes"
const handlers: ReturnType<typeof createSigilMcpHandler>[] = []

function containers() {
  const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
  const workspaces = new WorkspaceRegistry({
    projects,
    store: memoryKv(new Map()),
  })
  return {
    projects,
    workspaces,
    grants: new ScopeGrantRegistry({
      createId: () => crypto.randomUUID(),
      scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
      store: memoryKv(new Map()),
    }),
  }
}

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.close()))
})

function initializeRequest(
  host: string,
  scopeHeaders: Record<string, string> = {},
) {
  return new Request(`http://${host}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host,
      ...createAgentMcpBearerHeaders(token),
      ...scopeHeaders,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "sigil-server-boundary", version: "0" },
      },
    }),
  })
}

describe("production MCP handler boundary", () => {
  it("uses JSON responses for the mounted production composition", async () => {
    const handler = createSigilMcpHandler({
      apiKey: token,
      port: 8808,
      containers: containers(),
    })
    handlers.push(handler)

    const response = await handler.handle(initializeRequest("127.0.0.1:8808"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
  })

  it("keeps the authenticated external gateway path without trusting the service bearer alone", async () => {
    const records = containers()
    records.projects.upsert({
      id: "project-external",
      name: "External API project",
      description: "Owns the external gateway scope.",
      members: [{ principalId: "user-external", role: "member" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-external",
    })
    records.workspaces.upsert({
      id: "workspace-external",
      projectId: "project-external",
      homeScopeId: "project-external",
      name: "External API workspace",
      description: "Scoped external MCP access.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-external",
    })
    const proof = issueScopeDelegation(
      {
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        scope: "workspace:workspace-external",
        subject: "user-external",
      },
      token,
    )
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: records,
      port: 8808,
    })
    handlers.push(handler)

    const delegated = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        "x-sigil-scope": "workspace:workspace-external",
        "x-sigil-scope-proof": proof,
      }),
    )
    expect(delegated.status).toBe(200)

    const bareServiceKey = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        "x-sigil-scope": "workspace:workspace-external",
      }),
    )
    expect(bareServiceKey.status).toBe(401)
  })

  it("rejects a valid bearer presented through an unapproved host", async () => {
    const handler = createSigilMcpHandler({
      apiKey: token,
      port: 8808,
      containers: containers(),
    })
    handlers.push(handler)

    const response = await handler.handle(initializeRequest("attacker.example"))

    expect(response.status).toBe(403)
  })

  it("automatically allows the hostname injected by Portless", async () => {
    const handler = createSigilMcpHandler({
      apiKey: token,
      port: 8808,
      portlessUrl: "http://sigil-chat-roadmap-gonk.localhost:1355",
      containers: containers(),
    })
    handlers.push(handler)

    const response = await handler.handle(
      initializeRequest("sigil-chat-roadmap-gonk.localhost:1355"),
    )

    expect(response.status).toBe(200)
  })

  it("projects Eve's signed end-user principal into a real tool context", async () => {
    const records = containers()
    records.projects.upsert({
      id: "project-home",
      name: "Canonical home",
      description: "The workspace's owner project.",
      members: [{ principalId: "user-owner", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    records.workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      homeScopeId: "project-home",
      name: "Shared workspace",
      description: "A resource with a direct grant.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    const grant = records.grants.create({
      actions: ["read", "tool"],
      createdBy: "user-owner",
      principalId: "user-1",
      resourceScope: "workspace:workspace-shared",
    })
    const registry = new ToolRegistry()
    registry.register({
      name: "sigil-test-whoami",
      description: "Return the real Gonk invocation principal.",
      approval: "read",
      input: passthrough(),
      handler: async (_input, context) => ({
        data: { principal: context.auth?.principal },
      }),
    })
    const bindingRecords = new Map<string, TestExecutionBinding>()
    const proof = issueTurnDelegation(
      {
        scope: "workspace:workspace-shared",
        subject: "user-1",
      },
      bindingRecords,
    )
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: records,
      executionBindings: bindingLookup(bindingRecords),
      port: 8808,
      source: registry,
    })
    await expect(
      authenticateEveTurnDelegation({
        bindings: bindingLookup(bindingRecords),
        policy: createContainerScopeAuthorizationPolicy(records),
        scope: { tier: "workspace", id: "workspace-shared" },
        secret: token,
        token: proof,
      }),
    ).resolves.toMatchObject({ principalId: "user-1" })
    handlers.push(handler)
    const initialized = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${proof}`,
        "x-sigil-scope": "workspace:workspace-shared",
      }),
    )
    expect(initialized.status).toBe(200)
    const sessionId = initialized.headers.get("mcp-session-id")
    expect(sessionId).toBeTruthy()

    const response = await handler.handle(
      new Request("http://127.0.0.1:8808/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          host: "127.0.0.1:8808",
          "mcp-session-id": sessionId!,
          authorization: `Bearer ${proof}`,
          "x-sigil-scope": "workspace:workspace-shared",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "sigil-test-whoami", arguments: {} },
        }),
      }),
    )
    const responseBody = await response.json()
    expect(responseBody).toMatchObject({
      result: {
        structuredContent: {
          principal: {
            id: "user-1",
            kind: "human",
            identity: { method: "custom:eve-turn-delegation" },
          },
        },
      },
    })
    expect(responseBody.result.structuredContent.principal).toMatchObject({
      delegation: { actorSessionId: "eve-session-user-1" },
    })

    const user2Proof = issueTurnDelegation(
      {
        scope: "workspace:workspace-shared",
        subject: "user-2",
      },
      bindingRecords,
    )
    const user2 = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${user2Proof}`,
        "x-sigil-scope": "workspace:workspace-shared",
      }),
    )
    expect(user2.status).toBe(401)

    records.grants.create({
      actions: ["read"],
      createdBy: "user-owner",
      principalId: "user-read-only",
      resourceScope: "workspace:workspace-shared",
    })
    const readOnlyProof = issueTurnDelegation(
      {
        scope: "workspace:workspace-shared",
        subject: "user-read-only",
      },
      bindingRecords,
    )
    const readOnly = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${readOnlyProof}`,
        "x-sigil-scope": "workspace:workspace-shared",
      }),
    )
    // A signed proof is not a tool permission: a read-only grant cannot
    // initialize an MCP tool session.
    expect(readOnly.status).toBe(401)

    records.grants.revoke(grant.id, "user-owner")
    const revoked = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${proof}`,
        "x-sigil-scope": "workspace:workspace-shared",
        // Reuse the same still-valid user-1 bearer: only the durable grant changed.
      }),
    )
    expect(revoked.status).toBe(401)
  })

  it("projects principal reach only from a personal agent's durable execution binding", async () => {
    const records = containers()
    records.projects.upsert({
      id: "project-home",
      name: "Canonical home",
      description: "The workspace's owner project.",
      members: [{ principalId: "user-1", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-1",
    })
    records.workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      homeScopeId: "project-home",
      name: "Shared workspace",
      description: "A principal-readable workspace.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-1",
    })
    const registry = new ToolRegistry()
    registry.register({
      name: "sigil-test-reach",
      description: "Return the host-projected agent reach.",
      approval: "read",
      input: passthrough(),
      handler: async (_input, context) => ({ data: context.host }),
    })
    const bindingRecords = new Map<string, TestExecutionBinding>()
    const proof = issueTurnDelegation(
      {
        actorSessionId: "eve-personal",
        scope: "workspace:workspace-shared",
        subject: "user-1",
      },
      bindingRecords,
    )
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: records,
      executionBindings: bindingLookup(bindingRecords),
      port: 8808,
      source: registry,
    })
    handlers.push(handler)
    const initialized = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${proof}`,
        "x-sigil-scope": "workspace:workspace-shared",
      }),
    )
    expect(initialized.status).toBe(200)
    const sessionId = initialized.headers.get("mcp-session-id")
    expect(sessionId).toBeTruthy()

    const response = await handler.handle(
      mcpRequest(
        sessionId!,
        {
          authorization: `Bearer ${proof}`,
          "x-sigil-scope": "workspace:workspace-shared",
        },
        2,
        "tools/call",
        { name: "sigil-test-reach", arguments: {} },
      ),
    )

    await expect(response.json()).resolves.toMatchObject({
      result: {
        structuredContent: {
          agentReach: "principal",
          resourceScope: { id: "workspace-shared", tier: "workspace" },
        },
      },
    })
  })

  it("discovers and invokes feature intake with signed principal, session, and scope provenance", async () => {
    const records = containers()
    records.projects.upsert({
      id: "project-home",
      name: "Canonical home",
      description: "The workspace's owner project.",
      members: [{ principalId: "user-1", role: "member" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-1",
    })
    records.workspaces.upsert({
      id: "workspace-feature-intake",
      projectId: "project-home",
      homeScopeId: "project-home",
      name: "Feature intake",
      description: "Workspace-scoped feature requests.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-1",
    })
    const repository = new MemoryWorkItemsRepository()
    const registry = new ToolRegistry({
      security: { approvalProvider: sigilApprovalProvider },
    })
    registerFeatureRequestTools(registry, repository)
    const bindingRecords = new Map<string, TestExecutionBinding>()
    const proof = issueTurnDelegation(
      {
        actorSessionId: "eve-session-42",
        scope: "workspace:workspace-feature-intake",
        subject: "user-1",
      },
      bindingRecords,
    )
    const scopeHeaders = {
      authorization: `Bearer ${proof}`,
      "x-sigil-scope": "workspace:workspace-feature-intake",
    }
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: records,
      executionBindings: bindingLookup(bindingRecords),
      port: 8808,
      source: registry,
    })
    handlers.push(handler)

    const initialized = await handler.handle(
      initializeRequest("127.0.0.1:8808", scopeHeaders),
    )
    expect(initialized.status).toBe(200)
    const mcpSessionId = initialized.headers.get("mcp-session-id")
    expect(mcpSessionId).toBeTruthy()

    const listed = await handler.handle(
      mcpRequest(mcpSessionId!, scopeHeaders, 2, "tools/list", {}),
    )
    expect(await listed.json()).toMatchObject({
      result: {
        tools: [
          expect.objectContaining({ name: "sigil-feature-request-propose" }),
        ],
      },
    })

    const invoked = await handler.handle(
      mcpRequest(mcpSessionId!, scopeHeaders, 3, "tools/call", {
        name: "sigil-feature-request-propose",
        arguments: {
          title: "Preserve feature provenance",
          problem: "Feature intake can lose its trusted actor session.",
          desiredOutcome: "Every proposal records verified actor provenance.",
        },
      }),
    )
    expect(await invoked.json()).toMatchObject({
      result: {
        structuredContent: {
          outcome: "created",
          workItem: {
            homeScopeId: "workspace-feature-intake",
            provenance: {
              actorPrincipalId: "user-1",
              agentSessionId: "eve-session-42",
            },
          },
        },
      },
    })
    const persisted = await repository.get()
    expect(persisted.stories.find((story) => story.id === "FR.1")).toMatchObject({
      homeScopeId: "workspace-feature-intake",
      provenance: {
        actorPrincipalId: "user-1",
        agentSessionId: "eve-session-42",
      },
    })

    const unboundProof = issueTurnDelegation(
      {
        actorSessionId: "eve-session-unbound",
        scope: "workspace:workspace-feature-intake",
        subject: "user-1",
      },
      bindingRecords,
    )
    bindingRecords.delete("eve-session-unbound")
    const unboundHeaders = {
      authorization: `Bearer ${unboundProof}`,
      "x-sigil-scope": "workspace:workspace-feature-intake",
    }
    const unboundInitialized = await handler.handle(
      initializeRequest("127.0.0.1:8808", unboundHeaders),
    )
    expect(unboundInitialized.status).toBe(401)
    await expect(repository.get()).resolves.toMatchObject({ revision: 1 })
  })

  it("re-authorizes a signed session proof against its live thread owner", async () => {
    const sessionRecords = new Map<string, unknown>([
      [
        "thread:thread-owned",
        {
          id: "thread-owned",
          executionBinding: { homeScopeId: "personal-scope:user-1" },
          members: ["user-1"],
        },
      ],
    ])
    const sessionOwners = new MirkAgentThreadScopeOwnerRegistry({
      store: memoryKv(sessionRecords),
    })
    const bindingRecords = new Map<string, TestExecutionBinding>()
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: containers(),
      executionBindings: bindingLookup(bindingRecords),
      port: 8808,
      sessionOwners,
    })
    handlers.push(handler)
    const proof = issueTurnDelegation(
      {
        scope: "session:thread-owned",
        subject: "user-1",
      },
      bindingRecords,
    )

    const owner = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${proof}`,
        "x-sigil-scope": "session:thread-owned",
      }),
    )
    expect(owner.status).toBe(200)

    const outsiderProof = issueTurnDelegation(
      {
        scope: "session:thread-owned",
        subject: "user-2",
      },
      bindingRecords,
    )
    const outsider = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${outsiderProof}`,
        "x-sigil-scope": "session:thread-owned",
      }),
    )
    expect(outsider.status).toBe(401)

    sessionRecords.delete("thread:thread-owned")
    const revoked = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        authorization: `Bearer ${proof}`,
        "x-sigil-scope": "session:thread-owned",
        // Reuse the same unexpired bearer. Deleting the web-owned thread
        // revokes the scope because Gonk reads membership on every request.
      }),
    )
    expect(revoked.status).toBe(401)
  })
})

interface TestExecutionBinding {
  applicationThreadId: string
  homeScopeId: string
  personaId: string
  subject: string
}

function issueTurnDelegation(
  input: {
    actorSessionId?: string
    scope: string
    subject: string
  },
  bindings: Map<string, TestExecutionBinding>,
): string {
  const eveSessionId = input.actorSessionId ?? `eve-session-${input.subject}`
  const channelId = input.scope.startsWith("session:")
    ? input.scope.slice("session:".length)
    : `thread-${input.subject}`
  const personaId = "persona-default"
  bindings.set(eveSessionId, {
    applicationThreadId: channelId,
    homeScopeId: `personal-scope:${input.subject}`,
    personaId,
    subject: input.subject,
  })
  const now = Date.now()
  return createSignedDelegationProvider({
    issuer: SIGIL_GONK_DELEGATION_ISSUER,
    audience: SIGIL_GONK_DELEGATION_AUDIENCE,
    secret: token,
    authorize: () => ({ outcome: "deny", reason: "test" }),
  }).issue({
    issuer: SIGIL_GONK_DELEGATION_ISSUER,
    audience: SIGIL_GONK_DELEGATION_AUDIENCE,
    issuedAt: now,
    expiresAt: now + 60_000,
    subject: input.subject,
    channelId,
    personaId,
    eveSessionId,
    correlationId: `turn-${input.subject}`,
    delegationId: `delegation-${input.subject}`,
    activeResourceScope: input.scope,
  }, now)
}

function bindingLookup(bindings: Map<string, TestExecutionBinding>) {
  return {
    getBinding: async (sessionId: string) => bindings.get(sessionId),
  }
}

function memoryKv(values: Map<string, unknown>): KvStore<unknown> {
  return {
    delete: (key) => void values.delete(key),
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    get: (key) => values.get(key),
    list: (prefix = "") =>
      [...values.keys()].filter((key) => key.startsWith(prefix)),
    patch: () => {
      throw new Error("not implemented")
    },
    set: (key, value) => void values.set(key, value),
  }
}

function mcpRequest(
  sessionId: string,
  scopeHeaders: Record<string, string>,
  id: number,
  method: string,
  params: unknown,
): Request {
  return new Request("http://127.0.0.1:8808/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "127.0.0.1:8808",
      "mcp-session-id": sessionId,
      ...createAgentMcpBearerHeaders(token),
      ...scopeHeaders,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })
}
