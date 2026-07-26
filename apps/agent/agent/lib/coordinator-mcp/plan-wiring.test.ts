import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it } from "vitest"

import {
  coordinatorPrincipalId,
  decideDelegatedApproval,
} from "@workspace/agent-contracts/coordinator-authority"
import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"

import type { RealtimeVoiceClient } from "../realtime-voice"
import {
  buildCoordinatorSessionPlan,
  REALTIME_COORDINATOR_CONTEXT,
  REALTIME_HARDENED_CONTAINMENT_CONTEXT,
  type CoordinatorSessionPlanDeps,
} from "./session-plan"
import { parseCoordinatorContext } from "./context"
import {
  COORDINATOR_CAPABILITY,
  DEV_FALLBACK_AUTHORITY_SCOPE,
  resolveDevAuthorityScope,
  seedDevGrant,
} from "./plan-wiring"

const USER = "user-1"
/** A fresh dev thread: homeScopeId is NOT a registered project/workspace. */
const BINDING: AgentSessionBindingPayload = {
  audience: "sigil-agent-session-binding",
  version: 1,
  subject: USER,
  applicationThreadId: "thread-1",
  personaId: "persona-1",
  homeScopeId: "personal:user-1",
  initialPerspective: { focusScopeId: "personal:user-1", viaScopeIds: [] },
  additionalContextScopeIds: [],
  expiresAt: 9_999_999_999,
}

describe("resolveDevAuthorityScope", () => {
  it("returns the registered scope when there is one", () => {
    expect(
      resolveDevAuthorityScope({
        homeScopeId: "atlas",
        baseResolve: () => "workspace:atlas",
        devGrantEnabled: true,
      }),
    ).toBe("workspace:atlas")
  })

  it("falls back to the synthetic dev scope ONLY with the dev grant enabled", () => {
    expect(
      resolveDevAuthorityScope({
        homeScopeId: "personal:user-1",
        baseResolve: () => undefined,
        devGrantEnabled: true,
      }),
    ).toBe(DEV_FALLBACK_AUTHORITY_SCOPE)
    expect(
      resolveDevAuthorityScope({
        homeScopeId: "personal:user-1",
        baseResolve: () => undefined,
        devGrantEnabled: false,
      }),
    ).toBeUndefined()
  })

  it("mints a dev grant that authorizes the synthetic scope", () => {
    const grants = seedDevGrant(USER, DEV_FALLBACK_AUTHORITY_SCOPE)
    expect(
      decideDelegatedApproval({
        request: {
          actionId: "a",
          action: "tool",
          capability: COORDINATOR_CAPABILITY,
          principalId: coordinatorPrincipalId(USER),
          resourceScope: DEV_FALLBACK_AUTHORITY_SCOPE,
        },
        grants,
      }).status,
    ).toBe("auto-approved")
  })
})

const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  while (disposers.length) await disposers.pop()?.()
})

interface Captured {
  args: readonly string[]
  env: NodeJS.ProcessEnv
}

async function planFor(devGrantEnabled: boolean): Promise<Captured> {
  let captured: Captured | undefined
  const deps: CoordinatorSessionPlanDeps = {
    bindingSecret: "binding-secret",
    eveOrigin: "http://sigil-chat-agent.localhost:1355",
    allowLocalDevAuth: false, // keep dispose so tests self-clean
    capability: COORDINATOR_CAPABILITY,
    serverCommand: "node",
    serverArgs: ["/abs/server.js"],
    // The exact wiring plan-wiring installs: unresolvable home + the dev flag.
    resolveAuthorityScope: (homeScopeId) =>
      resolveDevAuthorityScope({
        homeScopeId,
        baseResolve: () => undefined,
        devGrantEnabled,
      }),
    resolveGrants: ({ authorityResourceScope }) =>
      devGrantEnabled ? seedDevGrant(USER, authorityResourceScope) : [],
    createRealtimeClient: (launch) => {
      captured = { args: launch.args, env: launch.env }
      return fakeClient()
    },
  }
  const plan = await buildCoordinatorSessionPlan(deps, {
    binding: BINDING,
    principalId: USER,
  })
  if (plan.dispose) disposers.push(plan.dispose)
  expect(plan.prompt).toBe(
    devGrantEnabled
      ? REALTIME_COORDINATOR_CONTEXT
      : REALTIME_HARDENED_CONTAINMENT_CONTEXT,
  )
  plan.createClient()
  return captured!
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

async function contextFromConfig(captured: Captured) {
  const toml = await readFile(`${captured.env.CODEX_HOME}/config.toml`, "utf8")
  const match = toml.match(/^SIGIL_COORDINATOR_CONTEXT = (.+)$/m)
  expect(match).toBeTruthy()
  // config.toml value is JSON.stringify(JSON.stringify(context)); parse twice.
  return parseCoordinatorContext({
    SIGIL_COORDINATOR_CONTEXT: JSON.parse(match![1]!) as string,
  })
}

describe("dev-grant path reaches an authorized coordinator (David's live-verify)", () => {
  it("attaches one coordinator MCP and its OWN grant authorizes", async () => {
    const captured = await planFor(true)
    const toml = await readFile(
      `${captured.env.CODEX_HOME}/config.toml`,
      "utf8",
    )
    expect(toml.match(/\[mcp_servers\.[^.\]]+\]/g)).toEqual([
      "[mcp_servers.coordinator]",
    ])
    // The grant baked into THIS plan's context authorizes the synthetic scope.
    const context = await contextFromConfig(captured)
    expect(context.authorityResourceScope).toBe(DEV_FALLBACK_AUTHORITY_SCOPE)
    expect(
      decideDelegatedApproval({
        request: {
          actionId: "a",
          action: "tool",
          capability: COORDINATOR_CAPABILITY,
          principalId: coordinatorPrincipalId(USER),
          resourceScope: DEV_FALLBACK_AUTHORITY_SCOPE,
        },
        grants: context.grants,
      }).status,
    ).toBe("auto-approved")
  })

  it("without the dev grant, an unresolvable home stays hardened, no coordinator", async () => {
    const captured = await planFor(false)
    const toml = await readFile(
      `${captured.env.CODEX_HOME}/config.toml`,
      "utf8",
    )
    expect(toml).toContain("shell_tool = false")
    expect(toml).not.toContain("[mcp_servers")
  })
})
