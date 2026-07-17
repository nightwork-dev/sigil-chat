import { useEffect, useMemo } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"

import type { AgentDomainOutcome } from "@zigil/agent-surface/outcomes"
import {
  createReactQueryOutcomeDispatcher,
  type AgentOutcomeReconciliationHandler,
} from "@zigil/agent-react-query"

import {
  AGENT_CLIENT_COMMAND_EVENT,
  type AgentClientCommand,
} from "@/lib/agent-client-command"
import { REVIEW_DOCUMENT_ID, reviewDocumentKeys } from "./review-document"

const reviewDocumentChangedHandler: AgentOutcomeReconciliationHandler = {
  kind: "review.document.changed",
  schema: {
    "~standard": {
      version: 1,
      vendor: "sigil-chat",
      validate(value) {
        const outcome = value as AgentDomainOutcome
        if (
          !value ||
          typeof value !== "object" ||
          outcome.kind !== "review.document.changed" ||
          outcome.resource?.kind !== "review-document" ||
          typeof outcome.resource.id !== "string" ||
          outcome.resource.id.length === 0
        ) {
          return { issues: [{ message: "Expected a review document outcome" }] }
        }
        return { value: outcome }
      },
    },
  },
  reconcile: async (outcome, context) => {
    await context.invalidate([reviewDocumentKeys.detail(outcome.resource.id)])
  },
}

export function createAgentDomainOutcomeDispatcher(queryClient: QueryClient) {
  return createReactQueryOutcomeDispatcher({
    queryClient,
    handlers: [reviewDocumentChangedHandler],
    duplicateKindPolicy: "reject",
    unhandledOutcomePolicy: "ignore",
  })
}

export function agentDomainOutcomeFromCommand(
  command: AgentClientCommand,
): AgentDomainOutcome | null {
  if (command.type === "agent.domain.outcome") return command.payload

  if (
    command.type === "review.annotation.add" ||
    command.type === "review.passage.update"
  ) {
    const payload =
      command.payload && typeof command.payload === "object"
        ? (command.payload as {
            revision?: unknown
            annotations?: Array<{ id?: unknown }>
          })
        : undefined
    const annotationIds =
      command.type === "review.annotation.add"
        ? (payload?.annotations ?? []).flatMap(({ id }) =>
            typeof id === "string" ? [id] : [],
          )
        : []
    const stableLegacyIdentity =
      command.type === "review.annotation.add"
        ? annotationIds.join(",")
        : typeof payload?.revision === "number"
          ? String(payload.revision)
          : ""
    return {
      id: `legacy:${command.type}:${stableLegacyIdentity || "unknown"}`,
      kind: "review.document.changed",
      resource: {
        kind: "review-document",
        id: REVIEW_DOCUMENT_ID,
        revision:
          typeof payload?.revision === "number" ? payload.revision : undefined,
      },
      operation:
        command.type === "review.annotation.add"
          ? "annotations.add"
          : "passages.update",
      changedIds: annotationIds.length > 0 ? annotationIds : undefined,
      deduplicate: stableLegacyIdentity.length > 0,
    }
  }
  return null
}

export function AgentDomainOutcomeReconciler() {
  const queryClient = useQueryClient()
  const dispatcher = useMemo(
    () => createAgentDomainOutcomeDispatcher(queryClient),
    [queryClient],
  )

  useEffect(() => {
    const listener = (event: Event) => {
      const command = (event as CustomEvent<AgentClientCommand>).detail
      const outcome = agentDomainOutcomeFromCommand(command)
      if (outcome) void dispatcher.dispatch(outcome)
    }
    window.addEventListener(AGENT_CLIENT_COMMAND_EVENT, listener)
    return () =>
      window.removeEventListener(AGENT_CLIENT_COMMAND_EVENT, listener)
  }, [dispatcher])

  return null
}
