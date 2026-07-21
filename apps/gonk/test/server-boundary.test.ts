import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"
import { passthrough, ToolRegistry } from "@gonk/tool-registry"
import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

import { ProjectRegistry } from "../../agent/agent/lib/project-registry.js"
import { WorkspaceRegistry } from "../../agent/agent/lib/workspace-registry.js"
import { createAgentMcpBearerHeaders } from "@zigil/agent-gonk"

import { createSigilMcpHandler } from "../src/mcp-handler.js"
import {
  authenticateScopeDelegation,
  createContainerScopeAuthorizationPolicy,
} from "../src/auth.js"

const token = "sigil-server-boundary-token"
const handlers: ReturnType<typeof createSigilMcpHandler>[] = []

function containers() {
  const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
  return {
    projects,
    workspaces: new WorkspaceRegistry({
      projects,
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
      id: "project-1",
      name: "Project One",
      description: "A scoped project.",
      members: [{ principalId: "user-member", role: "member" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-member",
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
    const proof = issueScopeDelegation(
      {
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        scope: "project:project-1",
        subject: "user-member",
      },
      token,
    )
    const handler = createSigilMcpHandler({
      apiKey: token,
      containers: records,
      port: 8808,
      source: registry,
    })
    await expect(
      authenticateScopeDelegation({
        policy: createContainerScopeAuthorizationPolicy(records),
        proof,
        scope: { tier: "project", id: "project-1" },
        secret: token,
      }),
    ).resolves.toMatchObject({ principalId: "user-member" })
    handlers.push(handler)
    const initialized = await handler.handle(
      initializeRequest("127.0.0.1:8808", {
        "x-sigil-scope": "project:project-1",
        "x-sigil-scope-proof": proof,
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
          ...createAgentMcpBearerHeaders(token),
          "x-sigil-scope": "project:project-1",
          "x-sigil-scope-proof": proof,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "sigil-test-whoami", arguments: {} },
        }),
      }),
    )
    expect(await response.json()).toMatchObject({
      result: {
        structuredContent: {
          principal: {
            id: "user-member",
            kind: "human",
            identity: { method: "custom:scope-delegation" },
          },
        },
      },
    })
  })
})

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
