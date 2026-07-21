import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { projectAgentThreadSummary } from "@/lib/agent-threads-domain";
import type {
  AgentThread,
  AgentThreadExecutionBinding,
  AgentThreadPreference,
  AgentThreadSnapshot,
  AgentThreadSummary,
  ForkAgentThreadInput,
  ScopePerspective,
} from "@/lib/agent-threads-domain";
import type { SigilAuthSession } from "@/lib/auth/server";
import { useAgentPrincipalId } from "@/lib/agent-principal";

export type {
  AgentThread,
  AgentThreadForkMessage,
  AgentThreadForkSeed,
  AgentThreadPreference,
  AgentThreadSnapshot,
  AgentThreadStatus,
  AgentThreadSummary,
  CreateAgentThreadInput,
  ForkAgentThreadInput,
} from "@/lib/agent-threads-domain";

const listAgentThreadsFn = createServerFn({ method: "GET" })
  .validator((input: { includeArchived?: boolean }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const threads = data.includeArchived
      ? agentThreadRepository.list(session.user.id, true)
      : agentThreadRepository.ensureActive(session.user.id);
    return threads.map(projectAgentThreadSummary);
  });

const getAgentThreadFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const thread = agentThreadRepository.get(session.user.id, data.id);
    if (!thread) throw new Error(`Agent thread ${data.id} was not found.`);
    return thread;
  });

const createAgentThreadFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      personaId: string;
      title?: string;
      workspaceId?: string;
      sessionKind?: "workspace" | "personal";
      initialPerspective?: ScopePerspective;
      additionalContextScopeIds?: string[];
    }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const { personaRegistry } = await import("@/lib/agent-profile.server");
    if (!personaRegistry.exists(data.personaId)) {
      throw new Error(`Persona ${data.personaId} was not found.`);
    }
    const binding = await resolveThreadCreationBinding(session.user.id, data);
    return agentThreadRepository.create(session.user.id, {
      personaId: data.personaId,
      title: data.title,
      ...(binding.workspaceId ? { workspaceId: binding.workspaceId } : {}),
      executionBinding: binding.executionBinding,
    });
  });

const rebindAgentThreadWorkspaceFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; workspaceId?: string; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    if (data.workspaceId) {
      await requireWorkspaceMembership(session.user.id, data.workspaceId);
    }
    return agentThreadRepository.rebindWorkspace(
      session.user.id,
      data.id,
      data.workspaceId,
      data.expectedRevision,
    );
  });

async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { getProjectWorkspaceRegistries } = await import(
    "../../../agent/agent/lib/project-workspace-registries"
  );
  const { assertRegisteredScopeMembership } = await import(
    "../../../agent/agent/lib/scope-authorization"
  );
  const registries = getProjectWorkspaceRegistries();
  if (!registries.workspaces.get(workspaceId)) {
    throw new Error(`Workspace ${workspaceId} was not found.`);
  }
  assertRegisteredScopeMembership(`workspace:${workspaceId}`, userId, registries);
}

async function resolveThreadCreationBinding(
  principalId: string,
  input: {
    personaId: string;
    workspaceId?: string;
    sessionKind?: "workspace" | "personal";
    initialPerspective?: ScopePerspective;
    additionalContextScopeIds?: string[];
  },
): Promise<{
  workspaceId?: string;
  executionBinding: AgentThreadExecutionBinding;
}> {
  const { agentThreadRepository } = await import("@/lib/agent-threads.server");
  const {
    loadProjectWorkspaceNav,
    resolveScopePerspective,
  } = await import("@/lib/agent-thread-containers.server");
  const { getProjectWorkspaceRegistries } = await import(
    "../../../agent/agent/lib/project-workspace-registries"
  );
  const registries = getProjectWorkspaceRegistries();
  const nav = loadProjectWorkspaceNav(principalId);
  const preference = agentThreadRepository.getActivePreference(principalId);
  const requestedPerspective =
    input.initialPerspective ?? preference.activePerspective;

  if (input.sessionKind === "personal") {
    const personalScope =
      registries.personalScopes.ensureForPrincipal(principalId);
    const initialPerspective = requestedPerspective
      ? resolvePersonalAwarePerspective(
          requestedPerspective,
          personalScope.id,
          nav,
          resolveScopePerspective,
        )
      : { focusScopeId: personalScope.id, viaScopeIds: [] };
    return {
      executionBinding: {
        principalId,
        personaId: input.personaId,
        homeScopeId: personalScope.id,
        initialPerspective,
        additionalContextScopeIds: authorizedContextScopes(
          input.additionalContextScopeIds ?? [],
          personalScope.id,
          nav,
        ),
      },
    };
  }

  const workspaceId = input.workspaceId ?? preference.activeWorkspaceId;
  if (!workspaceId) {
    throw new Error("Workspace-homed agent thread requires a workspace.");
  }
  await requireWorkspaceMembership(principalId, workspaceId);
  const initialPerspective = requestedPerspective
    ? resolveScopePerspective(requestedPerspective, nav)?.perspective
    : resolveScopePerspective(
        { focusScopeId: workspaceId, viaScopeIds: [] },
        nav,
      )?.perspective;
  if (!initialPerspective || initialPerspective.focusScopeId !== workspaceId) {
    throw new Error("Agent thread initial perspective is not valid.");
  }
  return {
    workspaceId,
    executionBinding: {
      principalId,
      personaId: input.personaId,
      homeScopeId: workspaceId,
      initialPerspective,
      additionalContextScopeIds: authorizedContextScopes(
        input.additionalContextScopeIds ?? [],
        undefined,
        nav,
      ),
    },
  };
}

async function assertExecutionBindingVisible(
  principalId: string,
  binding: AgentThreadExecutionBinding,
): Promise<void> {
  const { loadProjectWorkspaceNav } = await import(
    "@/lib/agent-thread-containers.server"
  );
  const { getProjectWorkspaceRegistries } = await import(
    "../../../agent/agent/lib/project-workspace-registries"
  );
  const registries = getProjectWorkspaceRegistries();
  const personalScope = registries.personalScopes.getForPrincipal(principalId);
  const nav = loadProjectWorkspaceNav(principalId);
  if (
    binding.homeScopeId !== personalScope?.id &&
    !scopeVisibleInNav(binding.homeScopeId, nav)
  ) {
    throw new Error("Agent thread home scope is not visible to this principal.");
  }
  authorizedContextScopes(
    binding.additionalContextScopeIds,
    personalScope?.id,
    nav,
  );
}

function resolvePersonalAwarePerspective(
  requested: ScopePerspective,
  personalScopeId: string,
  nav: {
    personalProjectId: string;
    projects: readonly { id: string }[];
    workspaces: readonly { id: string }[];
  },
  resolveScopePerspective: (
    requested: ScopePerspective,
    nav: any,
  ) => { perspective: ScopePerspective } | undefined,
): ScopePerspective {
  if (
    requested.focusScopeId === personalScopeId &&
    requested.viaScopeIds.length === 0
  ) {
    return { focusScopeId: personalScopeId, viaScopeIds: [] };
  }
  const resolved = resolveScopePerspective(requested, nav)?.perspective;
  if (!resolved) {
    throw new Error("Agent thread initial perspective is not visible.");
  }
  return resolved;
}

function authorizedContextScopes(
  scopeIds: readonly string[],
  personalScopeId: string | undefined,
  nav: {
    projects: readonly { id: string }[];
    workspaces: readonly { id: string }[];
  },
): string[] {
  const seen = new Set<string>();
  const authorized: string[] = [];
  for (const scopeId of scopeIds) {
    const normalized = scopeId.trim();
    if (!normalized || seen.has(normalized)) continue;
    if (normalized === personalScopeId || scopeVisibleInNav(normalized, nav)) {
      seen.add(normalized);
      authorized.push(normalized);
      continue;
    }
    throw new Error(`Context scope ${normalized} is not visible to this principal.`);
  }
  return authorized;
}

function scopeVisibleInNav(
  scopeId: string,
  nav: {
    projects: readonly { id: string }[];
    workspaces: readonly { id: string }[];
  },
): boolean {
  return (
    nav.projects.some((project) => project.id === scopeId) ||
    nav.workspaces.some((workspace) => workspace.id === scopeId)
  );
}

const renameAgentThreadFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; title: string; expectedRevision?: number }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.rename(
      session.user.id,
      data.id,
      data.title,
      data.expectedRevision,
    );
  });

const archiveAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.archive(
      session.user.id,
      data.id,
      data.expectedRevision,
    );
  });

const deleteAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.delete(
      session.user.id,
      data.id,
      data.expectedRevision,
    );
  });

const saveAgentThreadSnapshotFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      snapshot: AgentThreadSnapshot;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.saveSnapshot(
      session.user.id,
      data.id,
      data.snapshot,
      data.expectedRevision,
    );
  });

const forkAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: ForkAgentThreadInput) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const source = agentThreadRepository.get(session.user.id, data.sourceThreadId);
    if (!source) {
      throw new Error(`Agent thread ${data.sourceThreadId} was not found.`);
    }
    if (!source.executionBinding) {
      throw new Error("Source agent thread is missing an execution binding.");
    }
    await assertExecutionBindingVisible(session.user.id, source.executionBinding);
    return agentThreadRepository.fork(session.user.id, data);
  });

const consumeAgentThreadForkSeedFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.consumeForkSeed(
      session.user.id,
      data.id,
      data.expectedRevision,
    );
  });

const getActiveAgentThreadPreferenceFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { agentThreadRepository } = await import("@/lib/agent-threads.server");
  const session = await requireThreadSession();
  const preference = agentThreadRepository.getActivePreference(session.user.id);
  if (!preference.activePerspective) return preference;

  const {
    legacyContainerProjection,
    loadProjectWorkspaceNav,
    resolveScopePerspective,
  } = await import(
    "@/lib/agent-thread-containers.server"
  );
  const nav = loadProjectWorkspaceNav(session.user.id);
  const resolved = resolveScopePerspective(preference.activePerspective, nav);
  if (!resolved) {
    // The focus is no longer visible. Clear rather than retaining a stale id
    // or trying to infer another scope.
    return agentThreadRepository.setActiveContainer(session.user.id, {});
  }
  const legacy = legacyContainerProjection(resolved.perspective, nav);
  if (
    !resolved.diagnostic &&
    preference.activeProjectId === legacy.projectId &&
    preference.activeWorkspaceId === legacy.workspaceId
  ) {
    return preference;
  }
  return agentThreadRepository.setActiveContainer(session.user.id, {
    ...legacy,
    perspective: resolved.perspective,
  });
});

const setActiveAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.setActive(session.user.id, data.id);
  });

// §3.1 — the active container selection. Read is the plain preference read
// (getActiveAgentThreadPreferenceFn already returns the whole preference);
// write validates membership + containment against the registries before
// persisting — the domain store deliberately does not know the registry.
const setActiveContainerFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      projectId?: string;
      workspaceId?: string;
      perspective?: ScopePerspective;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const {
      legacyContainerProjection,
      loadProjectWorkspaceNav,
      resolveScopePerspective,
    } = await import(
      "@/lib/agent-thread-containers.server"
    );
    const session = await requireThreadSession();
    const nav = loadProjectWorkspaceNav(session.user.id);

    const requestedPerspective =
      data.perspective ??
      (data.workspaceId
        ? {
            focusScopeId: data.workspaceId,
            viaScopeIds: data.projectId ? [data.projectId] : [],
          }
        : data.projectId
          ? { focusScopeId: data.projectId, viaScopeIds: [] }
          : undefined);
    const resolved = requestedPerspective
      ? resolveScopePerspective(requestedPerspective, nav)
      : undefined;
    if (requestedPerspective && !resolved) {
      throw new Error("Requested scope is not visible to this principal.");
    }
    const perspective = resolved?.perspective;
    const legacy = perspective
      ? legacyContainerProjection(perspective, nav)
      : {};

    return agentThreadRepository.setActiveContainer(session.user.id, {
      ...legacy,
      perspective,
    });
  });

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
};

export function useAgentThreads(includeArchived = false) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: agentThreadKeys.list(principalId, includeArchived),
    queryFn: () => listAgentThreadsFn({ data: { includeArchived } }),
  });
}

export function useAgentThread(id: string | undefined) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: agentThreadKeys.detail(principalId, id ?? "none"),
    queryFn: () => getAgentThreadFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
  });
}

export function useActiveAgentThreadPreference() {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: agentThreadKeys.preference(principalId),
    queryFn: () => getActiveAgentThreadPreferenceFn(),
  });
}

export function useSetActiveContainer() {
  const principalId = useAgentPrincipalId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId?: string;
      workspaceId?: string;
      perspective?: ScopePerspective;
    }) =>
      setActiveContainerFn({ data: input }),
    onSuccess: (preference) => {
      queryClient.setQueryData(agentThreadKeys.preference(principalId), preference);
    },
  });
}

export function useCreateAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (
      input: {
        personaId: string;
        title?: string;
        workspaceId?: string;
        sessionKind?: "workspace" | "personal";
        initialPerspective?: ScopePerspective;
        additionalContextScopeIds?: string[];
      },
    ) => createAgentThreadFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, principalId, thread);
      cacheActivePreference(queryClient, principalId, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      });
    },
  });
}

export function useRebindAgentThreadWorkspace() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: {
      id: string;
      workspaceId?: string;
      expectedRevision?: number;
    }) => rebindAgentThreadWorkspaceFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, principalId, thread),
  });
}

export function useRenameAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: {
      id: string;
      title: string;
      expectedRevision?: number;
    }) => renameAgentThreadFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, principalId, thread),
  });
}

export function useArchiveAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      archiveAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, principalId, thread);
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(principalId),
      });
    },
  });
}

export function useDeleteAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      deleteAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      queryClient.removeQueries({
        queryKey: agentThreadKeys.detail(principalId, thread.id),
      });
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(principalId, true),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      );
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(principalId, false),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      );
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(principalId),
      });
    },
  });
}

export function useSaveAgentThreadSnapshot() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: {
      id: string;
      snapshot: AgentThreadSnapshot;
      expectedRevision?: number;
    }) => saveAgentThreadSnapshotFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, principalId, thread),
  });
}

export function useForkAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: ForkAgentThreadInput) =>
      forkAgentThreadFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, principalId, thread);
      cacheActivePreference(queryClient, principalId, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      });
    },
  });
}

export function useConsumeAgentThreadForkSeed() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      consumeAgentThreadForkSeedFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, principalId, thread),
  });
}

export function useSetActiveAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: { id?: string }) =>
      setActiveAgentThreadFn({ data: input }),
    onSuccess: (preference) =>
      cacheActivePreference(queryClient, principalId, preference),
  });
}

function cacheThread(
  queryClient: QueryClient,
  principalId: string,
  thread: AgentThread,
) {
  queryClient.setQueryData(
    agentThreadKeys.detail(principalId, thread.id),
    thread,
  );
  const summary = projectAgentThreadSummary(thread);
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(principalId, true),
    (current) => upsertThread(current, summary),
  );
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(principalId, false),
    (current) =>
      thread.status === "archived"
        ? current?.filter((candidate) => candidate.id !== thread.id)
        : upsertThread(current, summary),
  );
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
  );
}

function upsertThread(
  current: AgentThreadSummary[] | undefined,
  thread: AgentThreadSummary,
): AgentThreadSummary[] | undefined {
  if (!current) return current;
  const withoutThread = current.filter(
    (candidate) => candidate.id !== thread.id,
  );
  return [...withoutThread, thread].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id),
  );
}

async function requireThreadSession(): Promise<SigilAuthSession> {
  const { getSession, requireSession } = await import("@/lib/auth/session");
  const session = await getSession();
  const assertSession: (
    candidate: SigilAuthSession | null,
  ) => asserts candidate is SigilAuthSession = requireSession;
  assertSession(session);
  return session;
}
