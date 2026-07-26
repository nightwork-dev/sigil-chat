// The coordinator MCP server — one tool, launched per live voice session.
//
// codex spawns this over stdio (see ./launch-config.ts). It exposes exactly
// ONE capability this cut, `delegate_to_eve`, and it is the realtime thread's
// ONLY authority: the launch disables the built-in shell tools, so if the
// voice agent is to do real app work it must go through here, into the bound
// Eve thread, under a delegated grant. No grant, no delegation — the tool
// answers with a plain sentence the model can speak, never an error the model
// has to interpret.
//
// message_peer and record_request are VOX.6.2 and deliberately absent.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { coordinatorPrincipalId } from "@workspace/agent-contracts/coordinator-authority"

import { parseCoordinatorContext } from "./context"
import { createEveDelegatePort } from "./eve-delegate-port"
import { delegateToEve, type DelegateCoreContext } from "./delegate-core"

const DELEGATE_TOOL_NAME = "delegate_to_eve"
const DELEGATE_TOOL_DESCRIPTION = [
  "Carry out real work in the Sigil app by delegating a plain-language request",
  "to the user's actual Eve agent (its persona, memory, tools, and one shared",
  "transcript), then speak back only Eve's reply. Use this whenever the user",
  "asks you to DO something in the app rather than just talk. You cannot see the",
  "app's screen or state; describe what the user wants and let Eve act.",
].join(" ")

export function createCoordinatorMcpServer(
  env: NodeJS.ProcessEnv = process.env,
): McpServer {
  const context = parseCoordinatorContext(env)
  const core: DelegateCoreContext = {
    coordinatorPrincipalId: coordinatorPrincipalId(context.principalId),
    authorityResourceScope: context.authorityResourceScope,
    capability: context.capability,
    grants: context.grants,
    port: createEveDelegatePort(context),
    createActionId: () => crypto.randomUUID(),
  }

  const server = new McpServer({
    name: "sigil-coordinator",
    version: "0.1.0",
  })

  server.registerTool(
    DELEGATE_TOOL_NAME,
    {
      description: DELEGATE_TOOL_DESCRIPTION,
      inputSchema: {
        request: z
          .string()
          .describe("What the user wants done, in plain language."),
      },
    },
    async ({ request }) => {
      const outcome = await delegateToEve(core, request)
      // Only `spoken` ever leaves this process. The receipt (grantId) is logged
      // to stderr for the session's audit trail, not spoken. A DURABLE,
      // structured audit record (who delegated what, under which grant, when)
      // is VOX.6.2 — stderr is the first-cut trail, not the system of record.
      if ("grantId" in outcome) {
        process.stderr.write(
          `[coordinator] ${outcome.status} under grant ${outcome.grantId}\n`,
        )
      }
      return { content: [{ type: "text", text: outcome.spoken }] }
    },
  )

  return server
}

export async function runCoordinatorMcpServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const server = createCoordinatorMcpServer(env)
  await server.connect(new StdioServerTransport())
}

// Entry point: `node .../coordinator-mcp/server.js`. Guarded so importing the
// factory in a test never spawns a transport.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCoordinatorMcpServer().catch((error: unknown) => {
    process.stderr.write(
      `[coordinator] failed to start: ${(error as Error).message}\n`,
    )
    process.exit(1)
  })
}
