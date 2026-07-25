import { describe, expect, it } from "vitest"

import { CODEX_APP_SERVER_ARGS } from "../realtime-appserver"
import {
  parseCoordinatorContext,
  COORDINATOR_CONTEXT_ENV_VAR,
  type CoordinatorBoundContext,
} from "./context"
import {
  buildCoordinatorLaunchConfig,
  COORDINATOR_MCP_SERVER_NAME,
} from "./launch-config"

const CONTEXT: CoordinatorBoundContext = {
  applicationThreadId: "thread-1",
  principalId: "user-1",
  personaId: "persona-1",
  homeScopeId: "atlas",
  initialPerspective: { focusScopeId: "atlas", viaScopeIds: [] },
  additionalContextScopeIds: [],
  authorityResourceScope: "workspace:atlas",
  capability: "eve-delegation",
  eveOrigin: "http://sigil-chat-agent.localhost:1355",
  bindingSecret: "binding-secret",
  grants: [],
  allowLocalDevAuth: false,
}

function build() {
  return buildCoordinatorLaunchConfig({
    codexHome: "/tmp/session-home",
    coordinator: {
      serverCommand: "node",
      serverArgs: ["/abs/coordinator-mcp/server.js"],
      context: CONTEXT,
    },
  })
}

describe("the launch removes ambient exec", () => {
  it("disables the built-in shell tool", () => {
    const config = build()
    expect(config.features.shellTool).toBe(false)
    expect(config.configToml).toContain("shell_tool = false")
  })

  it("runs read-only with no interactive approvals", () => {
    const config = build()
    expect(config.sandboxMode).toBe("read-only")
    expect(config.approvalPolicy).toBe("never")
    expect(config.configToml).toContain('sandbox_mode = "read-only"')
    expect(config.configToml).toContain('approval_policy = "never"')
  })

  it("exposes EXACTLY ONE mcp server — the coordinator", () => {
    const config = build()
    expect(Object.keys(config.mcpServers)).toEqual([COORDINATOR_MCP_SERVER_NAME])
    expect(config.configToml).toContain(
      `[mcp_servers.${COORDINATOR_MCP_SERVER_NAME}]`,
    )
    // The user's ~/.codex servers must not load: only ours is declared.
    expect(config.configToml.match(/\[mcp_servers\.[^.\]]+\]/g)).toEqual([
      `[mcp_servers.${COORDINATOR_MCP_SERVER_NAME}]`,
    ])
  })

  it("keeps the realtime feature on so the call still connects", () => {
    expect(build().configToml).toContain("realtime_conversation = true")
  })
})

describe("the launch carries the bound context to the subprocess", () => {
  it("injects the context as the coordinator server's env, round-trippable", () => {
    const config = build()
    const server = config.mcpServers[COORDINATOR_MCP_SERVER_NAME]!
    expect(server.command).toBe("node")
    expect(server.args).toEqual(["/abs/coordinator-mcp/server.js"])
    expect(parseCoordinatorContext(server.env)).toEqual(CONTEXT)
    expect(config.configToml).toContain(COORDINATOR_CONTEXT_ENV_VAR)
  })

  it("points the app-server at the isolated home", () => {
    const config = build()
    expect(config.appServerArgs).toEqual(["app-server", "--stdio"])
    expect(config.appServerEnv.CODEX_HOME).toBe("/tmp/session-home")
  })
})

describe("hardened-only launch (Annika Finding 1): no coordinator, no ambient", () => {
  const hardened = () =>
    buildCoordinatorLaunchConfig({ codexHome: "/tmp/session-home" })

  it("stays fully hardened with zero mcp servers", () => {
    const config = hardened()
    expect(config.features.shellTool).toBe(false)
    expect(config.sandboxMode).toBe("read-only")
    expect(config.approvalPolicy).toBe("never")
    expect(Object.keys(config.mcpServers)).toEqual([])
    expect(config.configToml).toContain("shell_tool = false")
    expect(config.configToml).not.toContain("[mcp_servers")
  })

  it("NEVER uses the ambient app-server args, with or without a coordinator", () => {
    // CODEX_APP_SERVER_ARGS carries mcp_servers={} + realtime via -c and, with
    // the user's ~/.codex, full ambient exec. The hardened launch must not be it.
    expect(hardened().appServerArgs).not.toEqual(CODEX_APP_SERVER_ARGS)
    expect(build().appServerArgs).not.toEqual(CODEX_APP_SERVER_ARGS)
    expect(hardened().appServerArgs).toEqual(["app-server", "--stdio"])
  })
})
