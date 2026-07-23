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
import { useRegisterAgentPresentation } from "@/lib/agent-surface-registry"
import {
  useActiveAgentThreadPreference,
  useSetActiveAgentThread,
} from "@/lib/agent-threads"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"

export function SessionChatSurface({
  threadId,
  railState,
  compact,
}: {
  threadId: string
  railState: HomeState<SessionHomeView>
  compact?: boolean
}) {
  const approvalMode = useToolApprovalMode()
  const preference = useActiveAgentThreadPreference()
  const setActiveThread = useSetActiveAgentThread()
  const [railOpen, setRailOpen] = useState(false)

  useEffect(() => {
    if (
      preference.data &&
      preference.data.activeThreadId !== threadId &&
      !setActiveThread.isPending
    ) {
      setActiveThread.mutate({ id: threadId })
    }
    // Only re-sync when the route's thread or the resolved preference
    // change — setActiveThread is a stable mutation object, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, preference.data?.activeThreadId])

  // §4.1 — this leaf is the whole conversation surface; registering here
  // suppresses the shell dock structurally for exactly as long as it's
  // mounted. The session's attention/artifact projection renders in the rail
  // instead (SessionHome already renders it), so there's still one agent
  // presentation, now docked in the rail rather than floating.
  useRegisterAgentPresentation("full")

  const rail = <SessionHome compact state={railState} />

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* SC.10 §9.3 — left-anchored, never centered: this box is flex-1, its
          left edge fixed by the session list beside it (never by the rail on
          the right, which can be zero-width when collapsed). AgentChat caps
          its OWN message/composer width at max-w-3xl with no mx-auto, so the
          reading measure stays capped without re-centering when this box's
          available width changes as the rail toggles. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AgentChat
          approvalMode={approvalMode}
          onApprovalModeChange={setToolApprovalMode}
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
          <Button
            aria-label={
              railOpen ? "Collapse session details" : "Expand session details"
            }
            className="my-2 shrink-0 self-start"
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
        </>
      )}
    </div>
  )
}
