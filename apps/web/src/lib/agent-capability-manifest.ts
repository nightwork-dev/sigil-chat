import { queryOptions, useQuery } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import type { CapabilityManifest } from "@workspace/agent-contracts/capability-manifest"

// The manifest the chat UI renders. It is reconstructed server-side from the
// verified session; the client never authors any of its fields. Eve rebuilds the
// same manifest from the same authorities (verified session + signed execution
// binding + the one tool registry), so the panel and the agent answer "what can
// you see / change" identically without passing a blob between them.

const fetchCapabilityManifestFn = createServerFn({ method: "GET" })
  .validator((threadId: string) => threadId)
  .handler(async ({ data: threadId }): Promise<CapabilityManifest> => {
    const { getSession } = await import("./auth/session")
    const {
      buildCapabilityManifestForSession,
      createProductionCapabilityManifestSources,
    } = await import("./agent-capability-manifest.server")

    const session = await getSession()
    const sources = await createProductionCapabilityManifestSources()
    return buildCapabilityManifestForSession(session, threadId, sources)
  })

export const capabilityManifestKeys = {
  all: () => ["capability-manifest"] as const,
  forThread: (threadId: string) =>
    ["capability-manifest", threadId] as const,
}

export function capabilityManifestQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: capabilityManifestKeys.forThread(threadId),
    queryFn: () => fetchCapabilityManifestFn({ data: threadId }),
    enabled: threadId.length > 0,
    staleTime: 5_000,
    retry: false,
  })
}

export function useCapabilityManifest(threadId: string) {
  return useQuery(capabilityManifestQueryOptions(threadId))
}
