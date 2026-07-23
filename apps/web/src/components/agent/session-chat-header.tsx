"use client"

// SC.10 §9.4/§9.5 step 4, revised by §9.7 — the session surface's reduced
// top rail: session identity ONLY now. Everything else the old inline
// AgentChatHeader rendered here moved or dropped:
// - run status → the composer's send/stop button (§9.7: ChatInput already
//   flips to a stop icon while streaming — that IS the run-state display,
//   and where the interrupt action lives; the status dot here would be a
//   second, redundant voice for the same datum). AgentStatusIndicator is no
//   longer imported here.
// - context/token/attention readout → the context rail header (§9.5 step 3)
// - approval mode (+ model) → the composer (agent-chat.tsx, gated on
//   hideHeader)
// - session switcher Sheet trigger → the persistent list pane (§9.2,
//   desktop); kept here ONLY at compact/mobile widths, since the pane isn't
//   reachable there without opening the whole app sidebar
// - ⌘K/⌘B chord hints → dropped (not session data; §9.4 says global,
//   discoverable affordances don't belong on this surface)
// SessionBlackboard is NOT dropped by §9.7 (its own step list doesn't
// mention it) — it moves in the §9.8 batch, which explicitly reassigns its
// action into the `＋` Add menu's "Session note" entry ("orphaned out of the
// header in §9.4" — that rehoming is §9.8's, not this commit's).

import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import { isAgentSessionBusy } from "@zigil/agent-surface/contracts"

import { AgentSessionSwitcher } from "@/components/agent/agent-chat-header"
import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"
import { SessionBlackboard } from "@/components/agent/session-blackboard"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentRoster } from "@/lib/agent-profile"
import { deriveThreadProjectId } from "@/lib/agent-thread-containers"
import { useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

export function SessionChatHeader({ compact }: { compact: boolean }) {
  const session = useAppAgentSession()
  const personaId = useAgentPersonaSession()
  const roster = useAgentRoster()
  const personaName = roster.data?.find((p) => p.id === personaId)?.name
  const threadControls = useAgentThreadControls()
  const busy = isAgentSessionBusy(session)

  const activeThreads = useAgentThreads()
  const projectNav = useProjectWorkspaceNav()
  const activeThreadSummary = activeThreads.data?.find(
    (thread) => thread.id === threadControls?.activeThreadId,
  )
  const activeThread = threadControls?.threads.find(
    (thread) => thread.id === threadControls.activeThreadId,
  )

  let blackboardContainers:
    | { workspaceId: string | undefined; projectId: string }
    | undefined
  if (activeThreadSummary && projectNav.data) {
    const nav = projectNav.data
    blackboardContainers = {
      workspaceId: activeThreadSummary.workspaceId,
      projectId: deriveThreadProjectId(
        activeThreadSummary,
        {
          getWorkspaceProjectId: (id) =>
            nav.workspaces.find((workspace) => workspace.id === id)?.projectId,
        },
        nav.personalProjectId,
      ),
    }
  }

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
      {compact && threadControls ? (
        <AgentSessionSwitcher
          busy={busy}
          controls={threadControls}
          personaName={personaName ?? personaId ?? undefined}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {personaName ? `${personaName} · ` : ""}
          {activeThread?.title ?? "Conversation"}
        </span>
      )}

      {threadControls?.activeThreadId ? (
        <SessionBlackboard
          projectId={blackboardContainers?.projectId}
          sessionId={threadControls.activeThreadId}
          workspaceId={blackboardContainers?.workspaceId}
        />
      ) : null}
    </div>
  )
}
