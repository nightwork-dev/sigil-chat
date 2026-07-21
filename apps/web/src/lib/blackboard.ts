import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import type { BlackboardDoc } from "@workspace/blackboard-store/types"

import type { BlackboardScope } from "@/lib/blackboard-scope"

const readBlackboardFn = createServerFn({ method: "GET" })
  .validator((input: { sessionId: string }) => input)
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const [
      { blackboardRepository },
      { agentThreadRepository },
      session,
      access,
    ] = await Promise.all([
      import("@workspace/blackboard-store"),
      import("./agent-threads.server"),
      currentSession(),
      import("./blackboard.server"),
    ])
    return access.readOwnedBlackboard(
      session,
      data.sessionId,
      agentThreadRepository,
      blackboardRepository,
    )
  })

const writeBlackboardFn = createServerFn({ method: "POST" })
  .validator(
    (input: { sessionId: string; content: string; expectedRevision: string }) =>
      input,
  )
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const [
      { blackboardRepository },
      { agentThreadRepository },
      session,
      access,
    ] = await Promise.all([
      import("@workspace/blackboard-store"),
      import("./agent-threads.server"),
      currentSession(),
      import("./blackboard.server"),
    ])
    return access.writeOwnedBlackboard(
      session,
      data,
      agentThreadRepository,
      blackboardRepository,
    )
  })

const readScopedBlackboardFn = createServerFn({ method: "GET" })
  .validator((input: BlackboardScope) => input)
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const [
      { blackboardRepository },
      { agentThreadRepository },
      session,
      access,
    ] = await Promise.all([
      import("@workspace/blackboard-store"),
      import("./agent-threads.server"),
      currentSession(),
      import("./blackboard.server"),
    ])
    return access.readScopedBlackboard(
      session,
      data,
      (userId, threadId) => Boolean(agentThreadRepository.get(userId, threadId)),
      blackboardRepository,
    )
  })

const writeScopedBlackboardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      scope: BlackboardScope
      content: string
      expectedRevision: string
    }) => input,
  )
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const [
      { blackboardRepository },
      { agentThreadRepository },
      session,
      access,
    ] = await Promise.all([
      import("@workspace/blackboard-store"),
      import("./agent-threads.server"),
      currentSession(),
      import("./blackboard.server"),
    ])
    return access.writeScopedBlackboard(
      session,
      data,
      (userId, threadId) => Boolean(agentThreadRepository.get(userId, threadId)),
      blackboardRepository,
    )
  })

export const blackboardKeys = {
  all: () => ["blackboard"] as const,
  detail: (sessionId: string) => [...blackboardKeys.all(), sessionId] as const,
  scoped: (scope: BlackboardScope) =>
    [...blackboardKeys.all(), scope.tier, scope.id] as const,
}

export function useBlackboard(sessionId: string | undefined) {
  return useQuery({
    queryKey: blackboardKeys.detail(sessionId ?? "none"),
    queryFn: () => readBlackboardFn({ data: { sessionId: sessionId ?? "" } }),
    enabled: Boolean(sessionId),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  })
}

export function useWriteBlackboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      sessionId: string
      content: string
      expectedRevision: string
    }) => writeBlackboardFn({ data: input }),
    onSuccess: (document) => {
      queryClient.setQueryData(
        blackboardKeys.detail(document.sessionId),
        document,
      )
      return queryClient.invalidateQueries({
        queryKey: blackboardKeys.detail(document.sessionId),
      })
    },
  })
}

/** A workspace or project's own shared scratch surface — same store as
 *  `useBlackboard`, different scope key (blackboard-scope.ts). */
export function useContainerBlackboard(scope: BlackboardScope | undefined) {
  return useQuery({
    queryKey: blackboardKeys.scoped(scope ?? { tier: "workspace", id: "none" }),
    queryFn: () => readScopedBlackboardFn({ data: scope! }),
    enabled: Boolean(scope),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  })
}

export function useWriteContainerBlackboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      scope: BlackboardScope
      content: string
      expectedRevision: string
    }) => writeScopedBlackboardFn({ data: input }),
    onSuccess: (document, variables) => {
      queryClient.setQueryData(blackboardKeys.scoped(variables.scope), document)
      return queryClient.invalidateQueries({
        queryKey: blackboardKeys.scoped(variables.scope),
      })
    },
  })
}

async function currentSession() {
  const { getSession } = await import("./auth/session")
  return getSession()
}
