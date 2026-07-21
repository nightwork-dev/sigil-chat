import { createServerFn } from "@tanstack/react-start"
import { useQuery, type QueryClient } from "@tanstack/react-query"

import { useAgentPrincipalId } from "@/lib/agent-principal"

export type HomeSignalScopeKind = "project" | "workspace" | "session"

export interface HomeActivityRecord {
  readonly id: string
  readonly agentPersonaId: string
  readonly occurredAt: string
  readonly summary: string
  readonly threadId: string
}

export interface HomeAttentionRecord {
  readonly id: string
  readonly agentPersonaId: string
  readonly anchorId: string
  readonly body: string
  readonly label: string
  readonly occurredAt: string
  readonly threadId: string
}

export interface HomeSignals {
  readonly activity: readonly HomeActivityRecord[]
  readonly attention: readonly HomeAttentionRecord[]
}

export interface HomeSignalsInput {
  readonly id: string
  readonly kind: HomeSignalScopeKind
}

const loadHomeSignalsFn = createServerFn({ method: "GET" })
  .validator((input: HomeSignalsInput) => input)
  .handler(async ({ data }): Promise<HomeSignals> => {
    const { loadHomeSignalsFromRequest } = await import("./home-signals.server")
    return loadHomeSignalsFromRequest(data)
  })

export const homeSignalKeys = {
  all: (principalId: string) => ["home-signals", principalId] as const,
  scope: (principalId: string, kind: HomeSignalScopeKind, id: string) =>
    [...homeSignalKeys.all(principalId), kind, id] as const,
}

export function invalidateHomeSignals(
  queryClient: QueryClient,
  principalId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: homeSignalKeys.all(principalId),
  })
}

export function useHomeSignals(
  kind: HomeSignalScopeKind,
  id: string,
  enabled = true,
) {
  const principalId = useAgentPrincipalId()
  return useQuery({
    queryKey: homeSignalKeys.scope(principalId, kind, id),
    queryFn: () => loadHomeSignalsFn({ data: { id, kind } }),
    enabled,
  })
}
