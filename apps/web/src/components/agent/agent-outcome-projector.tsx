import { useEffect, useRef } from "react"

import type { AgentRuntimeSession } from "@zigil/agent/contracts"

import {
  dispatchAgentClientCommand,
  validateAgentClientCommand,
} from "@/lib/agent-client-command"
import {
  dispatchAgentDomCommand,
  dispatchAgentDomCommands,
  isAgentDomCommand,
} from "@/lib/agent-dom-effects"

export function AgentOutcomeProjector({
  session,
}: {
  session: AgentRuntimeSession
}) {
  const appliedCallIds = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    const projectOutcomes = async () => {
      for (const message of session.data.messages) {
        for (const part of message.parts) {
          if (
            part.type !== "tool-call" ||
            part.state !== "output-available" ||
            appliedCallIds.current.has(part.id)
          ) {
            continue
          }
          const command = extractClientCommand(part.output)
          if (!command) continue

          appliedCallIds.current.add(part.id)
          if (isAgentDomCommand(command)) {
            dispatchAgentDomCommand(command)
            continue
          }
          const clientCommand = await validateAgentClientCommand(command)
          if (!clientCommand) continue
          if (cancelled) return

          dispatchAgentClientCommand(clientCommand)
          if (clientCommand.type !== "ui.highlight") continue
          const actions =
            clientCommand.payload.actions?.filter(isAgentDomCommand) ?? []
          if (actions.length > 0) {
            dispatchAgentDomCommands(actions, {
              clearPrevious: clientCommand.payload.clearPrevious,
            })
          }
        }
      }
    }
    void projectOutcomes()
    return () => {
      cancelled = true
    }
  }, [session.data.messages])

  return null
}

export function extractClientCommand(output: unknown): unknown {
  if (!output || typeof output !== "object") return null
  const record = output as Record<string, unknown>
  if (record.clientCommand !== undefined) return record.clientCommand

  for (const key of ["data", "structuredContent"]) {
    const nested = record[key]
    if (!nested || typeof nested !== "object") continue
    const command = (nested as Record<string, unknown>).clientCommand
    if (command !== undefined) return command
  }
  return null
}
