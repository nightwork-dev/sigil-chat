import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import { ProjectRegistry } from "../../agent/agent/lib/project-registry.js"
import { WorkspaceRegistry } from "../../agent/agent/lib/workspace-registry.js"
import { createAgentMcpBearerHeaders } from "@zigil/agent-gonk"

import { createSigilMcpHandler } from "../src/mcp-handler.js"

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

function initializeRequest(host: string) {
  return new Request(`http://${host}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host,
      ...createAgentMcpBearerHeaders(token),
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
