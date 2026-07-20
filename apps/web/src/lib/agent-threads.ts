import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type {
  AgentThread,
  AgentThreadPreference,
  AgentThreadSnapshot,
  AgentThreadSummary,
  ForkAgentThreadInput,
} from "@/lib/agent-threads-domain";
import type { SigilAuthSession } from "@/lib/auth/server";

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
    const { projectAgentThreadSummary } =
      await import("@/lib/agent-threads-domain");
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
  .validator((input: { personaId: string; title?: string }) => input)
  .handler(async ({ data }) => {
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    const session = await requireThreadSession();
    const { personaRegistry } = await import("@/lib/agent-profile.server");
    if (!personaRegistry.exists(data.personaId)) {
      throw new Error(`Persona ${data.personaId} was not found.`);
    }
    return agentThreadRepository.create(session.user.id, data);
  });

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
  all: () => ["agent-threads"] as const,
  lists: () => [...agentThreadKeys.all(), "list"] as const,
  list: (includeArchived = false) =>
    [...agentThreadKeys.lists(), { includeArchived }] as const,
  details: () => [...agentThreadKeys.all(), "detail"] as const,
  detail: (id: string) => [...agentThreadKeys.details(), id] as const,
  preference: () => [...agentThreadKeys.all(), "active-preference"] as const,
};

export function useAgentThreads(includeArchived = false) {
  return useQuery({
    queryKey: agentThreadKeys.list(includeArchived),
    queryFn: () => listAgentThreadsFn({ data: { includeArchived } }),
  });
}

export function useAgentThread(id: string | undefined) {
  return useQuery({
    queryKey: agentThreadKeys.detail(id ?? "none"),
    queryFn: () => getAgentThreadFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
  });
}

export function useActiveAgentThreadPreference() {
  return useQuery({
    queryKey: agentThreadKeys.preference(),
    queryFn: () => getActiveAgentThreadPreferenceFn(),
  });
}

export function useCreateAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { personaId: string; title?: string }) =>
      createAgentThreadFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, thread);
      cacheActivePreference(queryClient, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      });
    },
  });
}

export function useRenameAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      title: string;
      expectedRevision?: number;
    }) => renameAgentThreadFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, thread),
  });
}

export function useArchiveAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      archiveAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      cacheThread(queryClient, thread);
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(),
      });
    },
  });
}

export function useDeleteAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      deleteAgentThreadFn({ data: input }),
    onSuccess: async (thread) => {
      queryClient.removeQueries({
        queryKey: agentThreadKeys.detail(thread.id),
      });
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(true),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      );
      queryClient.setQueryData<AgentThreadSummary[]>(
        agentThreadKeys.list(false),
        (current) => current?.filter((candidate) => candidate.id !== thread.id),
      );
      await queryClient.invalidateQueries({
        queryKey: agentThreadKeys.preference(),
      });
    },
  });
}

export function useSaveAgentThreadSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      snapshot: AgentThreadSnapshot;
      expectedRevision?: number;
    }) => saveAgentThreadSnapshotFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, thread),
  });
}

export function useForkAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ForkAgentThreadInput) =>
      forkAgentThreadFn({ data: input }),
    onSuccess: (thread) => {
      cacheThread(queryClient, thread);
      cacheActivePreference(queryClient, {
        members: thread.members,
        activeThreadId: thread.id,
        updatedAt: thread.updatedAt,
      });
    },
  });
}

export function useConsumeAgentThreadForkSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      consumeAgentThreadForkSeedFn({ data: input }),
    onSuccess: (thread) => cacheThread(queryClient, thread),
  });
}

export function useSetActiveAgentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string }) =>
      setActiveAgentThreadFn({ data: input }),
    onSuccess: (preference) => cacheActivePreference(queryClient, preference),
  });
}

function cacheThread(queryClient: QueryClient, thread: AgentThread) {
  queryClient.setQueryData(agentThreadKeys.detail(thread.id), thread);
  const summary = projectCachedThreadSummary(thread);
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(true),
    (current) => upsertThread(current, summary),
  );
  queryClient.setQueryData<AgentThreadSummary[]>(
    agentThreadKeys.list(false),
    (current) =>
      thread.status === "archived"
        ? current?.filter((candidate) => candidate.id !== thread.id)
        : upsertThread(current, summary),
  );
}

function cacheActivePreference(
  queryClient: QueryClient,
  preference: AgentThreadPreference,
) {
  queryClient.setQueryData(agentThreadKeys.preference(), preference);
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

function projectCachedThreadSummary(thread: AgentThread): AgentThreadSummary {
  return {
    id: thread.id,
    personaId: thread.personaId,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: thread.status,
    revision: thread.revision,
    ...(thread.forkedFrom ? { forkedFrom: thread.forkedFrom } : {}),
  };
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
