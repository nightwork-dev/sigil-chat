// Proof that the coordinator MCP server ACTUALLY spawns and lists its tool —
// not merely that it is wired (Annika/team-lead Finding 2 follow-up). This runs
// the exact command resolveCoordinatorServerLaunch() produces (node + the tsx
// loader against server.ts in a dev checkout, or node + server.js when built),
// speaks MCP over stdio, and asserts delegate_to_eve appears to a real client.

import { describe, expect, it } from "vitest"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

import {
  serializeCoordinatorContext,
  type CoordinatorBoundContext,
} from "./context"
import { resolveCoordinatorServerLaunch } from "./plan-wiring"

const CONTEXT: CoordinatorBoundContext = {
  applicationThreadId: "thread-1",
  principalId: "user-1",
  personaId: "persona-1",
  homeScopeId: "personal:user-1",
  initialPerspective: { focusScopeId: "personal:user-1", viaScopeIds: [] },
  additionalContextScopeIds: [],
  authorityResourceScope: "project:sigil-dev-local",
  capability: "eve-delegation",
  eveOrigin: "http://localhost:9",
  bindingSecret: "binding-secret",
  grants: [],
  allowLocalDevAuth: true,
}

function stringEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") out[key] = value
  }
  return out
}

describe("the coordinator MCP server spawns and lists delegate_to_eve", () => {
  it(
    "starts under the resolved launch and exposes exactly the one tool",
    async () => {
      const launch = resolveCoordinatorServerLaunch()
      const transport = new StdioClientTransport({
        command: launch.command,
        args: launch.args,
        env: { ...stringEnv(), ...serializeCoordinatorContext(CONTEXT) },
        stderr: "pipe",
      })
      const client = new Client({ name: "spawn-probe", version: "0.0.0" })
      try {
        await client.connect(transport)
        const { tools } = await client.listTools()
        expect(tools.map((tool) => tool.name)).toEqual(["delegate_to_eve"])
      } finally {
        await client.close().catch(() => {})
      }
    },
    30_000,
  )
})
