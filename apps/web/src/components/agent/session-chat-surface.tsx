"use client"

// SC.10 §3.1/§6 step 8 — the session leaf IS the chat. A constrained
// (max-w-3xl) conversation column beside a collapsible session-context rail
// (the SC.7 SessionHome composition: produced artifacts, linked commitments,
// live attention/activity). This retires `/chat` as a distinct destination —
// see routes/_app/chat.tsx, now a resolver — so the conversation renders in
// exactly one place regardless of how it was reached.
//
// AppAgentSessions (components/agent-sessions.tsx) mounts exactly ONE live
// agent session app-wide, keyed by the active-thread preference — there is
// no per-route thread concept in the runtime layer. Landing on a session's
// own URL makes that thread the active one (mirrors what `/chat` did
// implicitly, since it only ever rendered "whichever thread is active").
// This is why the sync below is a real effect (not derivable state): it
// drives an external system (the app-global session binding), the same class
// of imperative session plumbing components/agent-sessions.tsx already does
// for context-draft scope.

import { useEffect, useState } from "react"
import { PanelRightCloseIcon, PanelRightIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

import { AgentChat } from "@/components/agent/agent-chat"
import { ContextTray, useContextTray } from "@/components/agent/context-tray"
import { SessionChatHeader } from "@/components/agent/session-chat-header"
import { useAttention } from "@/components/agent/workspace-attention"
import { useRegisterAgentPresentation } from "@/lib/agent-surface-registry"
import {
  useActiveAgentThreadPreference,
  useSetActiveAgentThread,
} from "@/lib/agent-threads"
import {
  useSetToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-preferences"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"

export function SessionChatSurface({
  threadId,
  railState,
  compact = false,
}: {
  /**
   * The thread's CANONICAL id, not the route's raw (possibly-slug) param —
   * setActiveThread's server fn does an exact id lookup, it doesn't resolve
   * slugs (only agentThreadQueryOptions/getAgentThreadFn does, at the
   * boundary). Undefined while the route's own thread query hasn't resolved
   * yet; the sync effect below simply waits.
   */
  threadId: string | undefined
  railState: HomeState<SessionHomeView>
  compact?: boolean
}) {
  const approvalMode = useToolApprovalMode()
  const setApprovalMode = useSetToolApprovalMode()
  const preference = useActiveAgentThreadPreference()
  const setActiveThread = useSetActiveAgentThread()
  const attention = useAttention()
  const [railOpen, setRailOpen] = useState(false)

  useEffect(() => {
    if (
      threadId &&
      preference.data &&
      preference.data.activeThreadId !== threadId &&
      !setActiveThread.isPending
    ) {
      setActiveThread.mutate({ id: threadId })
    }
    // Only re-sync when the route's canonical thread id or the resolved
    // preference change — setActiveThread is a stable mutation object, not a
    // dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, preference.data?.activeThreadId])

  // §4.1 — this leaf is the whole conversation surface; registering here
  // suppresses the shell dock structurally for exactly as long as it's
  // mounted. The session's attention/artifact projection renders in the rail
  // instead (SessionHome already renders it), so there's still one agent
  // presentation, now docked in the rail rather than floating.
  useRegisterAgentPresentation("full")

  // SC.10 §9.4 — the context/token/attention readout has exactly one home
  // now: this rail's own header. ContextTray.Root wraps the whole surface
  // (not just the header) so the collapsed-state count badge on the toggle
  // button — a SIBLING of the header, not a descendant — can still read the
  // same computed preview via useContextTray(), without a second copy of the
  // attention/privacy/exclusions/attachments pipeline.
  const rail = (
    <div className="flex h-full min-h-0 flex-col">
      <ContextRailHeader attention={attention ?? null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionHome compact state={railState} />
      </div>
    </div>
  )

  return (
    <ContextTray.Root attention={attention ?? null}>
      <div className="flex h-full min-h-0 flex-1">
        {/* SC.10 §9.3 — left-anchored, never centered: this box is flex-1, its
            left edge fixed by the session list beside it (never by the rail on
            the right, which can be zero-width when collapsed). AgentChat caps
            its OWN message/composer width at max-w-3xl with no mx-auto, so the
            reading measure stays capped without re-centering when this box's
            available width changes as the rail toggles. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SessionChatHeader compact={compact} />
          <AgentChat
            approvalMode={approvalMode}
            hideHeader
            onApprovalModeChange={setApprovalMode.set}
            placeholder="Ask the agent, or tell it to use an application tool…"
            showNewSession={false}
          />
        </div>

        {compact ? (
          <Sheet onOpenChange={setRailOpen} open={railOpen}>
            <SheetTrigger
              aria-label="Session details"
              className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md hover:text-foreground"
            >
              <PanelRightIcon className="size-4" />
            </SheetTrigger>
            <SheetContent className="overflow-y-auto p-0" side="right">
              <SheetHeader>
                <SheetTitle>Session details</SheetTitle>
              </SheetHeader>
              {rail}
            </SheetContent>
          </Sheet>
        ) : (
          <>
            <div
              className={cn(
                "shrink-0 overflow-y-auto border-l border-border transition-[width]",
                railOpen ? "w-80" : "w-0 border-l-0",
              )}
            >
              {railOpen ? rail : null}
            </div>
            <div className="relative my-2 shrink-0 self-start">
              <Button
                aria-label={
                  railOpen
                    ? "Collapse session details"
                    : "Expand session details"
                }
                onClick={() => setRailOpen((open) => !open)}
                size="icon-sm"
                variant="ghost"
              >
                {railOpen ? (
                  <PanelRightCloseIcon className="size-3.5" />
                ) : (
                  <PanelRightIcon className="size-3.5" />
                )}
              </Button>
              {!railOpen ? <ContextRailToggleBadge /> : null}
            </div>
          </>
        )}
      </div>
    </ContextTray.Root>
  )
}

/** The rail's header: the context/token/focus-mode readout (ContextTray) +
 *  a one-line attention subject — the two things AgentRailStatus used to
 *  duplicate from the top rail. This IS the context surface now (§9.4); it
 *  renders nowhere else. */
function ContextRailHeader({
  attention,
}: {
  attention: Parameters<typeof ContextTray.Root>[0]["attention"]
}) {
  const subject =
    attention?.selection?.label ?? attention?.workspace?.label ?? null
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
      {subject ? (
        <span className="min-w-0 flex-1 truncate" title={subject}>
          {subject}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground/70">
          no context
        </span>
      )}
      <ContextTray.Trigger />
      <ContextTray.Content />
    </div>
  )
}

/** Count badge on the collapsed rail toggle (§9.4) — reads the SAME preview
 *  ContextRailHeader's ContextTray.Trigger shows, via the shared
 *  ContextTray.Root this whole surface is wrapped in. */
function ContextRailToggleBadge() {
  const { preview } = useContextTray()
  const count = preview?.selectionCount ?? 0
  if (count === 0) return null
  return (
    <span
      aria-hidden
      className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary font-mono text-[9px] text-primary-foreground"
    >
      {count > 9 ? "9+" : count}
    </span>
  )
}
