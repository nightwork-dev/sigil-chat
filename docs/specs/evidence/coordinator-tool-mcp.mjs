// Minimal stdio MCP server for the coordinator-tool-reach gate
// (docs/specs/evidence/coordinator-tool-gate.mjs).
//
// It exposes ONE tool, `lookup`, whose only job is to be an unmistakable
// oracle: it returns a per-run sentinel passphrase that the model cannot know
// unless it actually called this tool, and it appends a line to a log file the
// instant it is invoked. Two independent proofs of "the tool was reached":
//
//   * out-of-band  — the log file at $PROBE_MCP_LOG records every tools/call;
//   * in-band      — the sentinel ($PROBE_SENTINEL) appears in what the model
//                    speaks, which can only happen if the tool output flowed
//                    back into the realtime session.
//
// Speaks newline-delimited JSON-RPC 2.0 on stdio — the MCP stdio transport
// codex launches for a `mcp_servers` entry with a `command`. No dependencies.

import { appendFileSync } from "node:fs"

const SENTINEL = process.env.PROBE_SENTINEL ?? "SENTINEL-UNSET"
const LOG = process.env.PROBE_MCP_LOG

function logLine(kind, detail) {
  const line = `${new Date().toISOString()} ${kind}${detail ? ` ${detail}` : ""}\n`
  if (LOG) {
    try {
      appendFileSync(LOG, line)
    } catch {
      // The gate reads stderr too; never let logging kill the server.
    }
  }
  process.stderr.write(`[mcp] ${line}`)
}

logLine("start", `sentinel=${SENTINEL}`)

const TOOL = {
  name: "lookup",
  description:
    "Look up the current secret passphrase. Call this whenever the user asks " +
    "for the passphrase, the secret code, or the daily lookup value. Takes no " +
    "meaningful arguments.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up (optional)." },
    },
    additionalProperties: false,
  },
}

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function handle(msg) {
  const { id, method, params } = msg

  // Notifications (no id) — acknowledge nothing, just observe.
  if (id === undefined) {
    logLine("notification", method)
    return
  }

  switch (method) {
    case "initialize":
      logLine("initialize", JSON.stringify(params?.clientInfo ?? {}))
      send({
        jsonrpc: "2.0",
        id,
        result: {
          // Echo the client's protocol version when present; fall back to a
          // recent stable one so codex's MCP client is satisfied either way.
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "sigil-coordinator-probe", version: "0.0.1" },
        },
      })
      return
    case "tools/list":
      logLine("tools/list")
      send({ jsonrpc: "2.0", id, result: { tools: [TOOL] } })
      return
    case "tools/call": {
      const name = params?.name
      logLine("tools/call", `name=${name} args=${JSON.stringify(params?.arguments ?? {})}`)
      if (name !== "lookup") {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool ${name}` } })
        return
      }
      logLine("TOOL-INVOKED", `returning sentinel=${SENTINEL}`)
      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `The passphrase is ${SENTINEL}. Report it verbatim.` }],
          isError: false,
        },
      })
      return
    }
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} })
      return
    default:
      // Anything else (resources/list, prompts/list, ...) — answer with an
      // empty-ish result so the client never blocks on us.
      logLine("unhandled", method)
      send({ jsonrpc: "2.0", id, result: {} })
  }
}

let buffer = ""
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString()
  let newline = buffer.indexOf("\n")
  while (newline >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    newline = buffer.indexOf("\n")
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      logLine("parse-error", line.slice(0, 120))
      continue
    }
    try {
      handle(msg)
    } catch (error) {
      logLine("handler-error", String(error?.message ?? error))
    }
  }
})
process.stdin.on("end", () => logLine("stdin-end"))
