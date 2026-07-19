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

export function WorkspaceAttentionProvider({
  children,
}: {
  children: ReactNode
}) {
  const [published, setPublished] = useState<AttentionContext | null>(null)
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

  return (
    <PublishContext.Provider value={publish}>
      <AttentionProvider context={context}>{children}</AttentionProvider>
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

/** The active workspace attention (shell-level). Re-exported for convenience. */
export { useAttention }
