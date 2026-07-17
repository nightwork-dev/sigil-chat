import { useEffect, useRef } from "react"

import type { AgentRuntimeSession } from "@zigil/agent-surface"

import {
  dispatchAgentClientCommand,
  isAgentClientCommand,
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
        if (!isAgentClientCommand(command)) continue

        dispatchAgentClientCommand(command)
        if (command.type !== "ui.highlight") continue
        const actions = command.payload.actions?.filter(isAgentDomCommand) ?? []
        if (actions.length > 0) {
          dispatchAgentDomCommands(actions, {
            clearPrevious: command.payload.clearPrevious,
          })
        }
      }
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
