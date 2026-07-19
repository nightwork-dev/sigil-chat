// S1.9 — shell-owned workspace attention.
//
// The agent is chrome, not a route: one persistent HUD lives in the _app shell
// and must know what the *current* workspace is looking at. Rather than each
// workspace owning an isolated AttentionProvider (which the shell HUD, mounted
// above them, could never read), the shell owns ONE AttentionProvider and each
// workspace PUBLISHES its attention context up into it. The HUD and the
// app-global agent session (both inside this provider) then read the active
// workspace's attention automatically — so "distill this" / "what does this
// say about X" resolve against whatever room you're in, without naming it.
//
// Studio and Evidence publish via usePublishWorkspaceAttention; a workspace
// with no attention (e.g. Dashboard) simply never publishes and the shell
// falls back to a minimal { application, route } context.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouterState } from "@tanstack/react-router"
import {
  AttentionProvider,
  useAttention,
  type AttentionContext,
} from "@zigil/agent-react/attention"

type PublishFn = (context: AttentionContext | null) => void

const PublishContext = createContext<PublishFn | null>(null)

// A parallel channel for the OPTIONAL explicit resource scope a workspace wants
// the agent's tools to act on (codex's D4.4 companion fix). The Evidence Room
// publishes `project:evidence-room` so "distill this" / "ask" reach the room's
// durable corpus, not the per-thread session scope AgentChat otherwise defaults
// to. Workspaces that publish nothing leave this null and AgentChat falls back
// to the session scope — this is the "what workspace am I in → which resources
// may the agent use" link.
type ResourceScopeChannel = {
  scope: string | null
  publishScope: (scope: string | null) => void
}
const ResourceScopeContext = createContext<ResourceScopeChannel | null>(null)

export function WorkspaceAttentionProvider({
  children,
}: {
  children: ReactNode
}) {
  const [published, setPublished] = useState<AttentionContext | null>(null)
  const [resourceScope, setResourceScope] = useState<string | null>(null)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const publish = useCallback<PublishFn>((context) => {
    setPublished(context)
  }, [])

  // Fall back to a minimal context so the HUD/session always have a valid
  // route to reason about, even on workspaces that publish nothing.
  const context = useMemo<AttentionContext>(
    () => published ?? { application: "sigil-chat", route: pathname },
    [published, pathname],
  )

  const resourceScopeChannel = useMemo<ResourceScopeChannel>(
    () => ({ scope: resourceScope, publishScope: setResourceScope }),
    [resourceScope],
  )

  return (
    <PublishContext.Provider value={publish}>
      <ResourceScopeContext.Provider value={resourceScopeChannel}>
        <AttentionProvider context={context}>{children}</AttentionProvider>
      </ResourceScopeContext.Provider>
    </PublishContext.Provider>
  )
}

/**
 * Publish this workspace's attention context to the shell. Pass the context the
 * workspace would previously have handed to its own <AttentionProvider>; the
 * shell HUD and agent session read it. Publishing is keyed on the context's
 * content (not reference), so callers need not memoize perfectly, and re-runs
 * whenever selection/history change. Clears on unmount so stale attention from
 * a left workspace never lingers.
 */
export function usePublishWorkspaceAttention(
  context: AttentionContext | null,
): void {
  const publish = useContext(PublishContext)
  if (!publish) {
    throw new Error(
      "usePublishWorkspaceAttention must be used within WorkspaceAttentionProvider",
    )
  }
  const key = context ? JSON.stringify(context) : null
  useEffect(() => {
    publish(context)
    return () => publish(null)
    // key captures the meaningful content of context; publish is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, key])
}

/**
 * Publish the resource scope the agent's tools should act on for this workspace
 * (e.g. the Evidence Room's `project:evidence-room` corpus). Clears on unmount so
 * a left workspace never leaks its scope. Pass null to publish nothing.
 */
export function usePublishWorkspaceResourceScope(scope: string | null): void {
  const channel = useContext(ResourceScopeContext)
  if (!channel) {
    throw new Error(
      "usePublishWorkspaceResourceScope must be used within WorkspaceAttentionProvider",
    )
  }
  const { publishScope } = channel
  useEffect(() => {
    publishScope(scope)
    return () => publishScope(null)
  }, [publishScope, scope])
}

/**
 * The active workspace's explicit resource scope, or null when the current
 * workspace publishes none. AgentChat reads this to scope the agent turn to the
 * right corpus, falling back to the session scope when it is null.
 */
export function useWorkspaceResourceScope(): string | null {
  return useContext(ResourceScopeContext)?.scope ?? null
}

/** The active workspace attention (shell-level). Re-exported for convenience. */
export { useAttention }
