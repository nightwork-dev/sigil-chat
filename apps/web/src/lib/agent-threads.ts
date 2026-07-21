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
  AgentThreadPreference,
  AgentThreadSnapshot,
  AgentThreadSummary,
  ForkAgentThreadInput,
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
    (input: { personaId: string; title?: string; workspaceId?: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const { personaRegistry } = await import("@/lib/agent-profile.server");
    if (!personaRegistry.exists(data.personaId)) {
      throw new Error(`Persona ${data.personaId} was not found.`);
    }
    if (data.workspaceId) {
      await requireWorkspaceMembership(session.user.id, data.workspaceId);
    }
    return agentThreadRepository.create(session.user.id, data);
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
  return agentThreadRepository.getActivePreference(session.user.id);
});

const setActiveAgentThreadFn = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    return agentThreadRepository.setActive(session.user.id, data.id);
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

export function useCreateAgentThread() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: {
      personaId: string;
      title?: string;
      workspaceId?: string;
    }) => createAgentThreadFn({ data: input }),
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
  queryClient.setQueryData(
    agentThreadKeys.preference(principalId),
    preference,
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
