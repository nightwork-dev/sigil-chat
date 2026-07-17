import { afterEach, describe, expect, it } from "vitest"

import { createAgentMcpBearerHeaders } from "@zigil/agent-gonk"

import { createSigilMcpHandler } from "../src/mcp-handler.js"

const token = "sigil-server-boundary-token"
const handlers: ReturnType<typeof createSigilMcpHandler>[] = []

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
    const handler = createSigilMcpHandler({ apiKey: token, port: 8808 })
    handlers.push(handler)

    const response = await handler.handle(initializeRequest("127.0.0.1:8808"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
  })

  it("rejects a valid bearer presented through an unapproved host", async () => {
    const handler = createSigilMcpHandler({ apiKey: token, port: 8808 })
    handlers.push(handler)

    const response = await handler.handle(initializeRequest("attacker.example"))

    expect(response.status).toBe(403)
  })
})
