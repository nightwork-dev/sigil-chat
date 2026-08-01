import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { projectAgentThreadSummary } from "@/lib/agent-threads-domain"
import type {
  AgentThread,
  AgentThreadPreference,
  AgentThreadRequestOptions,
  AgentThreadSnapshot,
  AgentThreadSummary,
  ForkAgentThreadInput,
  ScopePerspective,
} from "@/lib/agent-threads-domain"
import type { SigilAuthSession } from "@/lib/auth/server"
import { useAgentPrincipalId } from "@/lib/agent-principal"
import { useUserSetting } from "@/lib/user-settings"
import { invalidateHomeSignals } from "@/lib/home-signals"

export type {
  AgentThread,
  AgentThreadForkMessage,
  AgentThreadForkSeed,
  AgentThreadPreference,
  AgentThreadRequestOptions,
  AgentThreadSnapshot,
  AgentThreadStatus,
  AgentThreadSummary,
  CreateAgentThreadInput,
  ForkAgentThreadInput,
} from "@/lib/agent-threads-domain"

const listAgentThreadsFn = createServerFn({ method: "GET" })
  .validator((input: { includeArchived?: boolean }) => input)
  .handler(async ({ data }) => {
    const { agentThreadBindingService, agentThreadRepository } =
      await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    const threads = data.includeArchived
      ? agentThreadRepository.list(session.user.id, true)
      : agentThreadBindingService.ensureActive(session.user.id)
    return threads.map(projectAgentThreadSummary)
  })

const getAgentThreadFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { agentContextReceiptRepository, agentThreadBindingService } =
      await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    const thread = agentThreadBindingService.resolveExecution(
      session.user.id,
      data.id,
    )
    return {
      ...thread,
      contextReceipts: agentContextReceiptRepository.list(thread.id, [
        `principal:${session.user.id}`,
        `persona:${thread.personaId}`,
        "viewer",
      ]),
    }
  })

/**
 * Real validation of the create body, not a pass-through cast.
 *
 * The exact-key check is load-bearing for the model contract: the browser may
 * name a preset ID and nothing else. A body carrying `baseUrl`, `provider`,
 * `apiKeyEnv`, or a resolved model is REFUSED rather than ignored, so an
 * attempt to supply an endpoint or credential from the client fails loudly
 * instead of quietly landing on the safe path.
 */
const CREATE_THREAD_KEYS = new Set([
  "personaId",
  "title",
  "workspaceId",
  "sessionKind",
  "initialPerspective",
  "additionalContextScopeIds",
  "modelPresetId",
])

export function parseCreateAgentThreadRequest(
  input: unknown,
): CreateAgentThreadRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("A thread creation request must be an object.")
  }
  const unexpected = Object.keys(input).filter(
    (key) => !CREATE_THREAD_KEYS.has(key),
  )
  if (unexpected.length > 0) {
    throw new Error(
      `Unsupported thread creation fields: ${unexpected.join(", ")}.`,
    )
  }
  const candidate = input as Record<string, unknown>
  if (
    typeof candidate.personaId !== "string" ||
    candidate.personaId.trim().length === 0
  ) {
    throw new Error("A persona id is required.")
  }
  const modelPresetId = candidate.modelPresetId
  if (
    modelPresetId !== undefined &&
    (typeof modelPresetId !== "string" ||
      // `<providerId>/<modelId>`, or the reserved deployment-default id.
      !/^[a-z][a-z0-9]*(-[a-z0-9]+)*(\/[a-z][a-z0-9]*(-[a-z0-9]+)*)?$/.test(
        modelPresetId.trim(),
      ) ||
      modelPresetId.trim().length > 129)
  ) {
    throw new Error("The requested model preset id is malformed.")
  }
  return {
    ...(candidate as unknown as CreateAgentThreadRequest),
    ...(typeof modelPresetId === "string"
      ? { modelPresetId: modelPresetId.trim() }
      : {}),
  }
}

export interface CreateAgentThreadRequest {
  personaId: string
  title?: string
  workspaceId?: string
  sessionKind?: "workspace" | "personal"
  initialPerspective?: ScopePerspective
  additionalContextScopeIds?: string[]
  /** Fixture preset id only. Never an endpoint, provider, or credential. */
  modelPresetId?: string
}

const createAgentThreadFn = createServerFn({ method: "POST" })
  .validator(parseCreateAgentThreadRequest)
  .handler(async ({ data }) => {
    const { agentThreadBindingService } =
      await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    const { personaRegistry } = await import("@/lib/agent-profile.server")
    if (!personaRegistry.exists(data.personaId)) {
      throw new Error(`Persona ${data.personaId} was not found.`)
    }
    return agentThreadBindingService.create(session.user.id, data)
  })

const rebindAgentThreadWorkspaceFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; workspaceId?: string; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    if (data.workspaceId) {
      await requireWorkspaceMembership(session.user.id, data.workspaceId)
    }
    return agentThreadRepository.rebindWorkspace(
      session.user.id,
      data.id,
      data.workspaceId,
      data.expectedRevision,
    )
  })

async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { getProjectWorkspaceRegistries } =
    await import("../../../agent/agent/lib/project-workspace-registries")
  const { assertRegisteredScopeMembership } =
    await import("../../../agent/agent/lib/scope-authorization")
  const registries = getProjectWorkspaceRegistries()
  if (!registries.workspaces.get(workspaceId)) {
    throw new Error(`Workspace ${workspaceId} was not found.`)
  }
  assertRegisteredScopeMembership(
    `workspace:${workspaceId}`,
    userId,
    registries,
  )
}

const renameAgentThreadFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; title: string; expectedRevision?: number }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.rename(
      session.user.id,
      data.id,
      data.title,
      data.expectedRevision,
    )
  })

const setAgentThreadRequestOptionsFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string
      requestOptions: AgentThreadRequestOptions
      expectedRevision?: number
    }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.setRequestOptions(
      session.user.id,
      data.id,
      data.requestOptions,
      data.expectedRevision,
    )
  })

const archiveAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.archive(
      session.user.id,
      data.id,
      data.expectedRevision,
    )
  })

const deleteAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentContextReceiptRepository, agentThreadRepository } =
      await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    const deleted = agentThreadRepository.delete(
      session.user.id,
      data.id,
      data.expectedRevision,
    )
    agentContextReceiptRepository.purge(deleted.id)
    return deleted
  })

const saveAgentThreadSnapshotFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string
      snapshot: AgentThreadSnapshot
      expectedRevision?: number
    }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.saveSnapshot(
      session.user.id,
      data.id,
      data.snapshot,
      data.expectedRevision,
    )
  })

const forkAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: ForkAgentThreadInput) => input)
  .handler(async ({ data }) => {
    const { agentThreadBindingService } =
      await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadBindingService.fork(session.user.id, data)
  })

const consumeAgentThreadForkSeedFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.consumeForkSeed(
      session.user.id,
      data.id,
      data.expectedRevision,
    )
  })

const getActiveAgentThreadPreferenceFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { agentThreadRepository } = await import("@/lib/agent-threads.server")
  const session = await requireThreadSession()
  const preference = agentThreadRepository.getActivePreference(session.user.id)
  if (!preference.activePerspective) return preference

  const { loadProjectWorkspaceNav, resolveScopePerspective } =
    await import("@/lib/agent-thread-containers.server")
  const nav = loadProjectWorkspaceNav(session.user.id)
  const resolved = resolveScopePerspective(preference.activePerspective, nav)
  if (!resolved) {
    // The focus is no longer visible. Clear rather than retaining a stale id
    // or trying to infer another scope.
    return agentThreadRepository.setActiveContainer(session.user.id, {})
  }
  if (!resolved.diagnostic) return preference
  return agentThreadRepository.setActiveContainer(session.user.id, {
    perspective: resolved.perspective,
  })
})

const setActiveAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const session = await requireThreadSession()
    return agentThreadRepository.setActive(session.user.id, data.id)
  })

// §3.1 — the active container selection. Read is the plain preference read
// (getActiveAgentThreadPreferenceFn already returns the whole preference);
// write validates membership + containment against the registries before
// persisting — the domain store deliberately does not know the registry.
const setActiveContainerFn = createServerFn({ method: "POST" })
  .validator((input: { perspective?: ScopePerspective }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } = await import("@/lib/agent-threads.server")
    const { loadProjectWorkspaceNav, resolveScopePerspective } =
      await import("@/lib/agent-thread-containers.server")
    const session = await requireThreadSession()
    const nav = loadProjectWorkspaceNav(session.user.id)

    const requestedPerspective = data.perspective
    const resolved = requestedPerspective
      ? resolveScopePerspective(requestedPerspective, nav)
      : undefined
    if (requestedPerspective && !resolved) {
      throw new Error("Requested scope is not visible to this principal.")
    }
    const perspective = resolved?.perspective
    return agentThreadRepository.setActiveContainer(session.user.id, {
      perspective,
    })
  })

export const agentThreadKeys = {
  all: (principalId: string) => ["agent-threads", principalId] as const,
  lists: (principalId: string) =>
    [...agentThreadKeys.all(principalId), "list"] as const,
  list: (principalId: string, includeArchived = false) =>
    [...agentThreadKeys.lists(principalId), { includeArchived }] as const,
  details: (principalId: string) =>
    [...agentThreadKeys.all(principalId), "detail"] as const,
  detail: (principalId: string, id: string) =>
    [...agentThreadKeys.details(principalId), id] as const,
  preference: (principalId: string) =>
    [...agentThreadKeys.all(principalId), "active-preference"] as const,
}

export function agentThreadsQueryOptions(
  principalId: string,
  includeArchived = false,
) {
  return queryOptions({
    queryKey: agentThreadKeys.list(principalId, includeArchived),
    queryFn: () => listAgentThreadsFn({ data: { includeArchived } }),
  })
}

export function agentThreadQueryOptions(
  principalId: string,
  id: string | undefined,
  enabled = true,
) {
  return queryOptions({
    queryKey: agentThreadKeys.detail(principalId, id ?? "none"),
    queryFn: () => getAgentThreadFn({ data: { id: id ?? "" } }),
    enabled: enabled && Boolean(id),
  })
}

export function useAgentThreads(includeArchived = false) {
  const principalId = useAgentPrincipalId()
  return useQuery(agentThreadsQueryOptions(principalId, includeArchived))
}

export function useAgentThread(id: string | undefined, enabled = true) {
  const principalId = useAgentPrincipalId()
  return useQuery(agentThreadQueryOptions(principalId, id, enabled))
}

export function activeAgentThreadPreferenceQueryOptions(principalId: string) {
  return queryOptions({
    queryKey: agentThreadKeys.preference(principalId),
    queryFn: () => getActiveAgentThreadPreferenceFn(),
  })
}

export function useActiveAgentThreadPreference() {
  const principalId = useAgentPrincipalId()
  return useQuery(activeAgentThreadPreferenceQueryOptions(principalId))
}

export function useSetActiveContainer() {
  const principalId = useAgentPrincipalId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { perspective?: ScopePerspective }) =>
      setActiveContainerFn({ data: input }),
    onSuccess: (preference) => {
      queryClient.setQueryData(
        agentThreadKeys.preference(principalId),
        preference,
      )
    },
  })
}

export function useCreateAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  // Settings -> Models records a preferred model for new sessions. Applying it
  // here rather than at each call site means every way of starting a session
  // honors it; an explicit per-session choice still wins.
  const preferredPreset = useUserSetting(principalId, "agent.modelPresetId")
  return useMutation({
    mutationFn: (input: CreateAgentThreadRequest) =>
      createAgentThreadFn({
        data: {
          ...(preferredPreset.data?.value
            ? { modelPresetId: preferredPreset.data.value }
            : {}),
          ...input,
        },
      }),
    onSuccess: (thread) => {
      cacheThread(queryClient, principalId, thread)
      cacheActivePreference(queryClient, principalId, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      })
    },
  })
}

export function useRebindAgentThreadWorkspace() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: {
      id: string
      workspaceId?: string
      expectedRevision?: number
    }) => rebindAgentThreadWorkspaceFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, principalId, thread)
      await invalidateHomeSignals(queryClient, principalId)
    },
  })
}

export function useRenameAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: {
      id: string
      title: string
      expectedRevision?: number
    }) => renameAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, principalId, thread)
      await invalidateHomeSignals(queryClient, principalId)
    },
  })
}

/**
 * MDL.4: mutate a thread's reasoning level / fast mode. Unlike model
 * selection, this never forks — the mutation targets the live thread, and
 * `onSuccess` caches the server's returned thread so the composer always
 * shows what is actually persisted (and therefore what the next turn will
 * run with), never an optimistic echo of the request.
 */
export function useSetAgentThreadRequestOptions() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: {
      id: string
      requestOptions: AgentThreadRequestOptions
      expectedRevision?: number
    }) => setAgentThreadRequestOptionsFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, principalId, thread)
    },
  })
}

export function useArchiveAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      archiveAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, principalId, thread)
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(principalId),
      })
      await invalidateHomeSignals(queryClient, principalId)
    },
  })
}

export function useDeleteAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      deleteAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      queryClient.removeQueries({
        queryKey: agentThreadKeys.detail(principalId, thread.id),
      })
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(principalId, true),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      )
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(principalId, false),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      )
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(principalId),
      })
      await invalidateHomeSignals(queryClient, principalId)
    },
  })
}

export function useSaveAgentThreadSnapshot() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: {
      id: string
      snapshot: AgentThreadSnapshot
      expectedRevision?: number
    }) => saveAgentThreadSnapshotFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, principalId, thread)
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.detail(principalId, thread.id),
      })
      await invalidateHomeSignals(queryClient, principalId)
    },
  })
}

export function useForkAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: ForkAgentThreadInput) =>
      forkAgentThreadFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, principalId, thread)
      cacheActivePreference(queryClient, principalId, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      })
    },
  })
}

export function useConsumeAgentThreadForkSeed() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      consumeAgentThreadForkSeedFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, principalId, thread),
  })
}

export function useSetActiveAgentThread() {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: { id?: string }) =>
      setActiveAgentThreadFn({ data: input }),
    onSuccess: (preference) =>
      cacheActivePreference(queryClient, principalId, preference),
  })
}

function cacheThread(
  queryClient: QueryClient,
  principalId: string,
  thread: AgentThread,
) {
  const detailKey = agentThreadKeys.detail(principalId, thread.id)
  queryClient.setQueryData<AgentThread>(detailKey, (current) =>
    mergeThreadForCache(current, thread),
  )
  const summary = projectAgentThreadSummary(thread)
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(principalId, true),
    (current) => upsertThread(current, summary),
  )
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(principalId, false),
    (current) =>
      thread.status === "archived"
        ? current?.filter((candidate) => candidate.id !== thread.id)
        : upsertThread(current, summary),
  )
}

export function mergeThreadForCache(
  current: AgentThread | undefined,
  incoming: AgentThread,
): AgentThread {
  if (incoming.contextReceipts !== undefined || !current?.contextReceipts) {
    return incoming
  }
  return {
    ...incoming,
    contextReceipts: current.contextReceipts,
  }
}

function cacheActivePreference(
  queryClient: QueryClient,
  principalId: string,
  preference: AgentThreadPreference,
) {
  // Merge, never replace: callers that only know the active thread (create/
  // fork) would otherwise drop the active container fields (§3.1) from the
  // cache until the next refetch — the chrome would visibly revert to the
  // personal project on every thread creation.
  queryClient.setQueryData(
    agentThreadKeys.preference(principalId),
    (current: AgentThreadPreference | undefined) => ({
      ...current,
      ...preference,
    }),
  )
}

function upsertThread(
  current: AgentThreadSummary[] | undefined,
  thread: AgentThreadSummary,
): AgentThreadSummary[] | undefined {
  if (!current) return current
  const withoutThread = current.filter(
    (candidate) => candidate.id !== thread.id,
  )
  return [...withoutThread, thread].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id),
  )
}

async function requireThreadSession(): Promise<SigilAuthSession> {
  const { getSession, requireSession } = await import("@/lib/auth/session")
  const session = await getSession()
  const assertSession: (
    candidate: SigilAuthSession | null,
  ) => asserts candidate is SigilAuthSession = requireSession
  assertSession(session)
  return session
}
