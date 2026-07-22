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

type ScopedRequestEvidenceInput = AddRequestEvidenceInput & {
  currentScopeId: string
}

type RequestScopeAccess = {
  canAccess(input: {
    principalId: string
    scopeId: string
    action: "board.read" | "board.write"
  }): boolean
}

const opaqueRequestMessage = "Request was not found."

const searchRequestsFn = createServerFn({ method: "GET" })
  .validator((input?: { filter?: RequestFilter }) => input ?? {})
  .handler(async ({ data }): Promise<RequestSearchResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    const { currentWorkItemsScopeAccess } = await import(
      "@/lib/work-items-access.server"
    )
    const viewer = authenticatedWorkItemsViewer(await getSession())
    const { workItemsRepository } = await import("@workspace/work-items-store")
    return filterVisibleRequestSearchResult(
      await workItemsRepository.searchRequests(data.filter),
      viewer.id,
      currentWorkItemsScopeAccess(),
    )
  })

const inspectRequestFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<RequestInspectResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    const { currentWorkItemsScopeAccess } = await import(
      "@/lib/work-items-access.server"
    )
    const viewer = authenticatedWorkItemsViewer(await getSession())
    const { workItemsRepository } = await import("@workspace/work-items-store")
    return requireReadableRequestInspectResult(
      await opaqueRequestLookup(() => workItemsRepository.inspectRequest(data.id)),
      viewer.id,
      currentWorkItemsScopeAccess(),
    )
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
  .validator((input: ScopedRequestEvidenceInput) => input)
  .handler(async ({ data }): Promise<WorkItemsMutationResult> => {
    const { getSession } = await import("@/lib/auth/session")
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    )
    const { currentWorkItemsScopeAccess } = await import(
      "@/lib/work-items-access.server"
    )
    const viewer = authenticatedWorkItemsViewer(await getSession())
    requireWritableScope(
      data.currentScopeId,
      viewer.id,
      currentWorkItemsScopeAccess(),
    )
    const { workItemsRepository } = await import("@workspace/work-items-store")
    const inspected = requireWritableRequestInspectResult(
      await opaqueRequestLookup(() =>
        workItemsRepository.inspectRequest(data.requestId),
      ),
      viewer.id,
      currentWorkItemsScopeAccess(),
    )
    if (inspected.request.homeScopeId !== data.currentScopeId) {
      throw new Error(opaqueRequestMessage)
    }
    const { currentScopeId: _currentScopeId, ...evidenceInput } = data
    return workItemsRepository.addRequestEvidence(evidenceInput, {
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
    mutationFn: (input: ScopedRequestEvidenceInput) =>
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

export function filterVisibleRequestSearchResult(
  result: RequestSearchResult,
  principalId: string,
  access: RequestScopeAccess,
): RequestSearchResult {
  return {
    ...result,
    requests: result.requests.filter((request) =>
      access.canAccess({
        principalId,
        scopeId: request.homeScopeId,
        action: "board.read",
      }),
    ),
  }
}

export function requireReadableRequestInspectResult(
  result: RequestInspectResult,
  principalId: string,
  access: RequestScopeAccess,
): RequestInspectResult {
  if (
    !access.canAccess({
      principalId,
      scopeId: result.request.homeScopeId,
      action: "board.read",
    })
  ) {
    throw new Error(opaqueRequestMessage)
  }
  return result
}

export function requireWritableRequestInspectResult(
  result: RequestInspectResult,
  principalId: string,
  access: RequestScopeAccess,
): RequestInspectResult {
  requireWritableScope(result.request.homeScopeId, principalId, access)
  return result
}

function requireWritableScope(
  scopeId: string,
  principalId: string,
  access: RequestScopeAccess,
): void {
  if (
    !access.canAccess({
      principalId,
      scopeId,
      action: "board.write",
    })
  ) {
    throw new Error(opaqueRequestMessage)
  }
}

async function opaqueRequestLookup<T>(lookup: () => Promise<T>): Promise<T> {
  try {
    return await lookup()
  } catch {
    throw new Error(opaqueRequestMessage)
  }
}

export type { HumanRequestInput, ScopedRequestEvidenceInput }
