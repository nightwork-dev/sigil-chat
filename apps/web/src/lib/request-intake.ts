import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { useAgentPrincipalId } from "@/lib/agent-principal"
import type {
  AddRequestEvidenceInput,
  FeatureRequestProposalInput,
  FeatureRequestProposalResult,
  RequestFilter,
  RequestInspectResult,
  RequestSearchResult,
  WorkItemsMutationResult,
} from "@workspace/work-items-store/types"

type HumanRequestInput = FeatureRequestProposalInput & {
  expectedRevision?: number
}

const searchRequestsFn = createServerFn({ method: "GET" })
  .validator((input?: { filter?: RequestFilter }) => input ?? {})
  .handler(async ({ data }): Promise<RequestSearchResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    authenticatedWorkItemsViewer(await getSession())
    const { workItemsRepository } = await import("@workspace/work-items-store")
    return workItemsRepository.searchRequests(data.filter)
  })

const inspectRequestFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<RequestInspectResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    authenticatedWorkItemsViewer(await getSession())
    const { workItemsRepository } = await import("@workspace/work-items-store")
    return workItemsRepository.inspectRequest(data.id)
  })

const createHumanRequestFn = createServerFn({ method: "POST" })
  .validator((input: HumanRequestInput) => input)
  .handler(async ({ data }): Promise<FeatureRequestProposalResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    const { currentWorkItemsScopeAccess } = await import(
      "@/lib/work-items-access.server"
    )
    const viewer = authenticatedWorkItemsViewer(await getSession())
    const targetScopeId = data.intendedScopeId?.trim()
    if (!targetScopeId) throw new Error("Request intake requires a target scope.")
    if (
      !currentWorkItemsScopeAccess().canAccess({
        principalId: viewer.id,
        scopeId: targetScopeId,
        action: "board.write",
      })
    ) {
      throw new Error("Request intake scope was not found.")
    }
    const { workItemsRepository } = await import("@workspace/work-items-store")
    return workItemsRepository.proposeFeatureRequest(
      {
        ...data,
        intendedScopeId: targetScopeId,
      },
      {
        actorPrincipalId: viewer.id,
        requesterId: viewer.id,
        requesterKind: "human",
        originMode: "human-direct",
        currentScopeId: targetScopeId,
        now: new Date().toISOString(),
      },
      data.expectedRevision,
    )
  })

const addRequestEvidenceFn = createServerFn({ method: "POST" })
  .validator((input: AddRequestEvidenceInput) => input)
  .handler(async ({ data }): Promise<WorkItemsMutationResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    const { currentWorkItemsScopeAccess } = await import(
      "@/lib/work-items-access.server"
    )
    const viewer = authenticatedWorkItemsViewer(await getSession())
    const { workItemsRepository } = await import("@workspace/work-items-store")
    const inspected = await workItemsRepository.inspectRequest(data.requestId)
    if (
      !currentWorkItemsScopeAccess().canAccess({
        principalId: viewer.id,
        scopeId: inspected.request.homeScopeId,
        action: "board.write",
      })
    ) {
      throw new Error("Request intake scope was not found.")
    }
    return workItemsRepository.addRequestEvidence(data, {
      actorPrincipalId: viewer.id,
      requesterId: viewer.id,
      requesterKind: "human",
      originMode: "human-direct",
      currentScopeId: inspected.request.homeScopeId,
      now: new Date().toISOString(),
    })
  })

export const requestKeys = {
  all: () => ["requests"] as const,
  search: (viewerId: string, filter?: RequestFilter) =>
    [...requestKeys.all(), "search", viewerId, filter ?? {}] as const,
  detail: (viewerId: string, id: string) =>
    [...requestKeys.all(), "detail", viewerId, id] as const,
}

export function useRequests(filter?: RequestFilter) {
  const principalId = useAgentPrincipalId()
  return useQuery({
    queryKey: requestKeys.search(principalId, filter),
    queryFn: () => searchRequestsFn({ data: { filter } }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  })
}

export function useRequest(id: string | undefined) {
  const principalId = useAgentPrincipalId()
  return useQuery({
    queryKey: requestKeys.detail(principalId, id ?? "none"),
    queryFn: () => inspectRequestFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  })
}

export function useCreateHumanRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: HumanRequestInput) =>
      createHumanRequestFn({ data: input }),
    onSuccess: (result) => reconcileRequest(queryClient, result),
  })
}

export function useAddRequestEvidence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddRequestEvidenceInput) =>
      addRequestEvidenceFn({ data: input }),
    onSuccess: (result) => reconcileRequest(queryClient, result),
  })
}

function reconcileRequest(
  queryClient: QueryClient,
  result: FeatureRequestProposalResult | WorkItemsMutationResult,
): Promise<void> {
  if ("outcome" in result && result.outcome === "duplicate") {
    return queryClient.invalidateQueries({ queryKey: requestKeys.all() })
  }
  const document = "document" in result ? result.document : undefined
  const ids = "changedIds" in result ? result.changedIds : []
  for (const id of ids) {
    const request = document?.stories.find((story) => story.id === id)
    if (request?.kind === "feature-request") {
      queryClient.setQueriesData(
        { queryKey: requestKeys.all() },
        (current: unknown) => current,
      )
    }
  }
  return queryClient.invalidateQueries({ queryKey: requestKeys.all() })
}

export type { HumanRequestInput }
