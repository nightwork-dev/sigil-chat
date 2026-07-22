import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  CreateSpecInput,
  ProductSpec,
  ReviseSpecInput,
  SpecFilter,
  SpecMutationResult,
  SpecStatus,
} from "@workspace/work-items-store/specs";

const listSpecsFn = createServerFn({ method: "GET" })
  .validator((input?: { filter?: SpecFilter }) => input ?? {})
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } =
      await import("@/lib/work-items-viewer.server");
    authenticatedWorkItemsViewer(await getSession());
    const { specsRepository } =
      await import("@workspace/work-items-store/specs");
    return {
      revision: await specsRepository.revision(),
      specs: await specsRepository.list(data.filter),
    };
  });

const getSpecFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } =
      await import("@/lib/work-items-viewer.server");
    authenticatedWorkItemsViewer(await getSession());
    const { specsRepository } =
      await import("@workspace/work-items-store/specs");
    const spec = await specsRepository.get(data.id);
    if (!spec) throw new Error(`Unknown spec id: ${data.id}.`);
    return { revision: await specsRepository.revision(), spec };
  });

const createSpecFn = createServerFn({ method: "POST" })
  .validator(
    (
      input: Omit<CreateSpecInput, "authoredBy"> & {
        expectedRevision?: number;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } =
      await import("@/lib/work-items-access.server");
    const viewer = requireWorkItemsMutationAccess(await getSession());
    const { specsRepository } =
      await import("@workspace/work-items-store/specs");
    return specsRepository.create(
      {
        id: data.id,
        title: data.title,
        summary: data.summary,
        body: data.body,
        storyIds: data.storyIds,
        supersedes: data.supersedes,
        authoredBy: viewer.user.username ?? viewer.user.name,
      },
      data.expectedRevision,
    );
  });

const reviseSpecFn = createServerFn({ method: "POST" })
  .validator(
    (input: ReviseSpecInput & { id: string; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } =
      await import("@/lib/work-items-access.server");
    requireWorkItemsMutationAccess(await getSession());
    const { specsRepository } =
      await import("@workspace/work-items-store/specs");
    const { id, expectedRevision, ...revision } = data;
    return specsRepository.revise(id, revision, expectedRevision);
  });

const transitionSpecFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; status: SpecStatus; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } =
      await import("@/lib/work-items-access.server");
    requireWorkItemsMutationAccess(await getSession());
    const { specsRepository } =
      await import("@workspace/work-items-store/specs");
    return specsRepository.transition(
      data.id,
      data.status,
      data.expectedRevision,
    );
  });

export const specKeys = {
  all: () => ["roadmap-specs"] as const,
  list: (filter?: SpecFilter) =>
    [...specKeys.all(), "list", filter ?? {}] as const,
  detail: (id: string) => [...specKeys.all(), id] as const,
};

export function useSpecs(filter?: SpecFilter) {
  return useQuery({
    queryKey: specKeys.list(filter),
    queryFn: () => listSpecsFn({ data: { filter } }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useSpec(id: string | undefined) {
  return useQuery({
    queryKey: specKeys.detail(id ?? "none"),
    queryFn: () => getSpecFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useCreateSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Omit<CreateSpecInput, "authoredBy"> & {
        expectedRevision?: number;
      },
    ) => createSpecFn({ data: input }),
    onSuccess: (result) => reconcileSpec(queryClient, result),
  });
}

export function useReviseSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: ReviseSpecInput & { id: string; expectedRevision?: number },
    ) => reviseSpecFn({ data: input }),
    onSuccess: (result) => reconcileSpec(queryClient, result),
  });
}

export function useTransitionSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      status: SpecStatus;
      expectedRevision?: number;
    }) => transitionSpecFn({ data: input }),
    onSuccess: (result) => reconcileSpec(queryClient, result),
  });
}

function reconcileSpec(
  queryClient: QueryClient,
  result: SpecMutationResult,
): Promise<void> {
  queryClient.setQueryData(specKeys.detail(result.spec.id), {
    revision: result.revision,
    spec: result.spec,
  });
  return queryClient.invalidateQueries({ queryKey: specKeys.all() });
}

export type { ProductSpec };
