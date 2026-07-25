// The codex launch that makes the coordinator surface the voice agent's ONLY
// authority — source-verified against /Users/dr/Dev/vendor/codex.
//
// The live-gate assessment's core danger is the realtime thread's raw local
// shell/exec authority: the delegated backend turn runs codex's normal tool
// path, so a voice call with ambient exec is a voice call that can run
// commands. This builder neutralizes that per session, three ways, each
// confirmed in the vendored source:
//
//   1. [features] shell_tool = false. codex-rs/tools/src/tool_config.rs
//      shell_type_for_model_and_features: `!features.enabled(Feature::ShellTool)`
//      => ConfigShellToolType::Disabled; core/src/tools/spec_plan.rs
//      add_shell_tools matches Disabled => registers NO shell / unified_exec /
//      write_stdin handler. The delegated turn shares this path (the handoff
//      routes through the same Op::UserInput), so exec is gone from it too.
//      `shell_tool` defaults to true (features/src/lib.rs), so this must be set.
//   2. sandbox_mode = "read-only" + approval_policy = "never". apply_patch is
//      gated on the environment having write access; a read-only sandbox
//      neutralizes the residual patch tool. (Residual: apply_patch under
//      read-only is the one thing left — called out for Annika in the report.)
//   3. An isolated CODEX_HOME with EXACTLY ONE mcp_server (this coordinator).
//      The user's ~/.codex may configure ~50 MCP servers; loading them would
//      blow the ~32s realtime-start window. A fresh home loads only ours.
//
// This module is PURE — it computes the config; ./materialize-codex-home.ts
// writes the directory and copies the ChatGPT credentials the isolated home
// still needs. Everything asserted above is falsifiable in text.

import {
  serializeCoordinatorContext,
  type CoordinatorBoundContext,
} from "./context"

/** Node runs the built stdio server; the parent env supplies PATH. */
export const COORDINATOR_MCP_SERVER_NAME = "coordinator"
/** Tight enough that one slow MCP launch cannot eat the realtime window. */
export const DEFAULT_COORDINATOR_STARTUP_TIMEOUT_SEC = 20

export interface CoordinatorLaunchInput {
  /** The per-session isolated CODEX_HOME (materialized separately). */
  readonly codexHome: string
  /** Command codex spawns for the MCP server (e.g. "node"). */
  readonly serverCommand: string
  /** Args for that command (e.g. [absolute path to the built server]). */
  readonly serverArgs: readonly string[]
  readonly context: CoordinatorBoundContext
  readonly startupTimeoutSec?: number
}

export interface CoordinatorStdioMcpServer {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly startupTimeoutSec: number
}

export interface CoordinatorLaunchConfig {
  readonly codexHome: string
  /** shellTool is `false` as a type, not just a value: the whole build exists
   *  to keep it that way. */
  readonly features: { readonly shellTool: false; readonly realtimeConversation: true }
  readonly sandboxMode: "read-only"
  readonly approvalPolicy: "never"
  /** Keyed by name; this cut ships exactly one entry. */
  readonly mcpServers: Readonly<Record<string, CoordinatorStdioMcpServer>>
  /** The config.toml body written into codexHome. */
  readonly configToml: string
  /** Args the realtime app-server itself is spawned with. */
  readonly appServerArgs: readonly string[]
  /** Env the app-server is spawned with — CODEX_HOME points it at the
   *  isolated home so it reads the config above and none of the user's. */
  readonly appServerEnv: Readonly<Record<string, string>>
}

export function buildCoordinatorLaunchConfig(
  input: CoordinatorLaunchInput,
): CoordinatorLaunchConfig {
  const startupTimeoutSec =
    input.startupTimeoutSec ?? DEFAULT_COORDINATOR_STARTUP_TIMEOUT_SEC
  const mcpServer: CoordinatorStdioMcpServer = {
    command: input.serverCommand,
    args: [...input.serverArgs],
    env: serializeCoordinatorContext(input.context),
    startupTimeoutSec,
  }
  const mcpServers = { [COORDINATOR_MCP_SERVER_NAME]: mcpServer }

  return {
    codexHome: input.codexHome,
    features: { shellTool: false, realtimeConversation: true },
    sandboxMode: "read-only",
    approvalPolicy: "never",
    mcpServers,
    configToml: renderConfigToml(mcpServers, startupTimeoutSec),
    appServerArgs: ["app-server", "--stdio"],
    appServerEnv: { CODEX_HOME: input.codexHome },
  }
}

function renderConfigToml(
  mcpServers: Readonly<Record<string, CoordinatorStdioMcpServer>>,
  startupTimeoutSec: number,
): string {
  const lines: string[] = [
    "# Generated per live voice session — do not edit.",
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    "",
    "[features]",
    "# Disables the built-in shell / unified_exec / write_stdin tools for the",
    "# realtime thread and its delegated backend turn (VOX.6.1).",
    "shell_tool = false",
    "realtime_conversation = true",
  ]
  for (const [name, server] of Object.entries(mcpServers)) {
    lines.push(
      "",
      `[mcp_servers.${name}]`,
      `command = ${tomlString(server.command)}`,
      `args = ${tomlStringArray(server.args)}`,
      `startup_timeout_sec = ${startupTimeoutSec}`,
      "",
      `[mcp_servers.${name}.env]`,
    )
    for (const [key, value] of Object.entries(server.env)) {
      lines.push(`${key} = ${tomlString(value)}`)
    }
  }
  return `${lines.join("\n")}\n`
}

/** JSON string escaping is a valid TOML basic string: same \", \\, \n, \uXXXX
 *  forms, and JSON never emits a bare control char. Reused for the env blob. */
function tomlString(value: string): string {
  return JSON.stringify(value)
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`
}
