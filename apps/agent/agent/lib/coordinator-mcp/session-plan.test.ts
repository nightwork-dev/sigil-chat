import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it } from "vitest"

import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"

import { CODEX_APP_SERVER_ARGS } from "../realtime-appserver"
import type { RealtimeVoiceClient, RealtimeVoiceSessionPlan } from "../realtime-voice"
import {
  buildCoordinatorSessionPlan,
  REALTIME_COORDINATOR_CONTEXT,
  REALTIME_HARDENED_CONTAINMENT_CONTEXT,
  type CoordinatorSessionPlanDeps,
} from "./session-plan"

const BINDING: AgentSessionBindingPayload = {
  audience: "sigil-agent-session-binding",
  version: 1,
  subject: "user-1",
  applicationThreadId: "thread-1",
  personaId: "persona-1",
  homeScopeId: "atlas",
  initialPerspective: { focusScopeId: "atlas", viaScopeIds: [] },
  additionalContextScopeIds: [],
  expiresAt: 9_999_999_999,
}

interface Captured {
  args: readonly string[]
  env: NodeJS.ProcessEnv
}

function fakeClient(): RealtimeVoiceClient {
  return {
    async start() {
      return { threadId: "t", answerSdp: "a" }
    },
    async stop() {},
    dispose() {},
  }
}

const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  while (disposers.length) await disposers.pop()?.()
})

async function planWith(
  overrides: Partial<CoordinatorSessionPlanDeps>,
): Promise<{ plan: RealtimeVoiceSessionPlan; captured: Captured }> {
  let captured: Captured | undefined
  const deps: CoordinatorSessionPlanDeps = {
    bindingSecret: "binding-secret",
    eveOrigin: "http://sigil-chat-agent.localhost:1355",
    allowLocalDevAuth: false,
    capability: "eve-delegation",
    serverCommand: "node",
    serverArgs: ["/abs/server.js"],
    resolveAuthorityScope: () => "workspace:atlas",
    resolveGrants: () => [],
    createRealtimeClient: (launch) => {
      captured = { args: launch.args, env: launch.env }
      return fakeClient()
    },
    ...overrides,
  }
  const plan = await buildCoordinatorSessionPlan(deps, {
    binding: BINDING,
    principalId: "user-1",
  })
  if (plan.dispose) disposers.push(plan.dispose)
  plan.createClient()
  return { plan, captured: captured! }
}

async function readConfigToml(captured: Captured): Promise<string> {
  const codexHome = captured.env.CODEX_HOME
  expect(codexHome).toBeTruthy()
  return readFile(`${codexHome}/config.toml`, "utf8")
}

describe("every plan is hardened and never ambient (Annika Finding 1)", () => {
  it("hardens + attaches the coordinator when the scope resolves", async () => {
    const { plan, captured } = await planWith({})
    expect(plan.prompt).toBe(REALTIME_COORDINATOR_CONTEXT)
    expect(captured.args).toEqual(["app-server", "--stdio"])
    expect(captured.args).not.toEqual(CODEX_APP_SERVER_ARGS)
    const toml = await readConfigToml(captured)
    expect(toml).toContain("shell_tool = false")
    expect(toml).toContain('sandbox_mode = "read-only"')
    expect(toml.match(/\[mcp_servers\.[^.\]]+\]/g)).toEqual([
      "[mcp_servers.coordinator]",
    ])
  })

  it("still hardens with NO coordinator when the scope does not resolve", async () => {
    const { plan, captured } = await planWith({
      resolveAuthorityScope: () => undefined,
    })
    expect(plan.prompt).toBe(REALTIME_HARDENED_CONTAINMENT_CONTEXT)
    expect(captured.args).toEqual(["app-server", "--stdio"])
    expect(captured.args).not.toEqual(CODEX_APP_SERVER_ARGS)
    const toml = await readConfigToml(captured)
    expect(toml).toContain("shell_tool = false")
    expect(toml).not.toContain("[mcp_servers")
  })

  it("still hardens with NO coordinator when there is no binding secret", async () => {
    const { plan, captured } = await planWith({ bindingSecret: undefined })
    expect(plan.prompt).toBe(REALTIME_HARDENED_CONTAINMENT_CONTEXT)
    expect(captured.args).toEqual(["app-server", "--stdio"])
    expect(captured.args).not.toEqual(CODEX_APP_SERVER_ARGS)
    const toml = await readConfigToml(captured)
    expect(toml).toContain("shell_tool = false")
    expect(toml).not.toContain("[mcp_servers")
  })
})
