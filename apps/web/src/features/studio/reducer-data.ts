import { createServerFn } from "@tanstack/react-start"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  graphComputationKey,
  reduceGraphDocument,
  type ReducerGraphCommand,
  type ReducerGraphDocument,
} from "@workspace/graph/document"
import { sampleReducerGraph } from "@workspace/graph/sample"

interface GraphCommandRequest {
  command: ReducerGraphCommand
  expectedRevision: number
}

const graphKeys = {
  detail: (id: string) => ["reducer-graph", id] as const,
  run: (id: string, computationKey: string) =>
    ["reducer-graph", id, "run", computationKey] as const,
}

const getGraphDocument = createServerFn({ method: "GET" }).handler(async () => {
  const { graphRepository } = await import("@workspace/graph-store/repository")
  return graphRepository.get()
})

const applyGraphCommand = createServerFn({ method: "POST" })
  .validator((value: GraphCommandRequest) => value)
  .handler(async ({ data }) => {
    const { graphRepository } = await import("@workspace/graph-store/repository")
    return graphRepository.apply(data.command, data.expectedRevision)
  })

const undoGraphCommand = createServerFn({ method: "POST" })
  .validator((value: { expectedRevision: number }) => value)
  .handler(async ({ data }) => {
    const { graphRepository } = await import("@workspace/graph-store/repository")
    return graphRepository.undo(data.expectedRevision)
  })

const runGraph = createServerFn({ method: "POST" }).handler(async () => {
  const { graphRepository } = await import("@workspace/graph-store/repository")
  return graphRepository.run()
})

export function useReducerGraph() {
  return useQuery({
    queryKey: graphKeys.detail(sampleReducerGraph.id),
    queryFn: () => getGraphDocument(),
    // v1 shared-attention sync placeholder: interval polling until a push
    // channel (websocket/SSE) exists for multi-client graph updates.
    refetchInterval: 1_000,
  })
}

export function useReducerGraphCommand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (command: ReducerGraphCommand) => {
      const key = graphKeys.detail(sampleReducerGraph.id)
      const previousDocument = queryClient.getQueryData<ReducerGraphDocument>(key)
      if (!previousDocument) throw new Error("The reducer graph has not loaded.")

      // Optimistic write: apply the command locally (with the same pure
      // reducer the server uses in graphRepository.apply) so callers like a
      // dragged node's committed position render immediately instead of
      // waiting on the round trip through the graph-store file lock, which
      // can take seconds under contention. Rolled back below if the server
      // rejects the command.
      try {
        queryClient.setQueryData(key, reduceGraphDocument(previousDocument, command))
      } catch {
        // The command would fail the server's validation too — let the
        // round trip surface the real error instead of guessing locally.
      }

      try {
        return await applyGraphCommand({
          data: { command, expectedRevision: previousDocument.revision },
        })
      } catch (error) {
        queryClient.setQueryData(key, previousDocument)
        throw error
      }
    },
    onSuccess: (document) => {
      queryClient.setQueryData(graphKeys.detail(sampleReducerGraph.id), document)
    },
  })
}

export function useReducerGraphUndo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      const document = queryClient.getQueryData<ReducerGraphDocument>(graphKeys.detail(sampleReducerGraph.id))
      if (!document) throw new Error("The reducer graph has not loaded.")
      return undoGraphCommand({ data: { expectedRevision: document.revision } })
    },
    onSuccess: (document) => {
      queryClient.setQueryData(graphKeys.detail(sampleReducerGraph.id), document)
    },
  })
}

export function useReducerGraphRun(document?: ReducerGraphDocument) {
  const computationKey = document ? graphComputationKey(document) : "pending"
  return useQuery({
    queryKey: graphKeys.run(sampleReducerGraph.id, computationKey),
    queryFn: () => runGraph(),
    enabled: Boolean(document),
  })
}
