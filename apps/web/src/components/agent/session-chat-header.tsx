"use client"

// SC.10 §9.4/§9.5 step 4, revised by §9.7 and §9.8 — the session surface's
// reduced top rail: session identity ONLY. Everything else the old inline
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
// - SessionBlackboard → the composer's ＋ Add menu's "Session note" entry
//   (§9.8a: "orphaned out of the header in §9.4" — that rehoming is this
//   commit's; `agent-chat.tsx` now drives `SessionBlackboardSheet`
//   directly via `useActiveThreadContainers()`, so this header no longer
//   needs the container-resolution it used to duplicate)

import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import { isAgentSessionBusy } from "@zigil/agent-surface/contracts"

import { AgentSessionSwitcher } from "@/components/agent/agent-chat-header"
import { AgentPresencePortrait } from "@/components/agent/agent-presence-portrait"
import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentRoster } from "@/lib/agent-profile"
import { AgentAccessControl } from "@/features/capabilities/agent-access-control"

export function SessionChatHeader({ compact }: { compact: boolean }) {
  const session = useAppAgentSession()
  const personaId = useAgentPersonaSession()
  const roster = useAgentRoster()
  const activePersona = roster.data?.find((p) => p.id === personaId)
  const personaName = activePersona?.name
  const threadControls = useAgentThreadControls()
  const busy = isAgentSessionBusy(session)
  const activeThreadId = threadControls?.activeThreadId
  const activeThread = threadControls?.threads.find(
    (thread) => thread.id === activeThreadId,
  )

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
      {/* The agent's face lives HERE — the session-identity row is where a user
          looks to register "who am I talking to", so it is the honest home for
          the meet-gaze target (VOX.7 capability 2). This is the one live
          presence portrait in /chat; it opts in as the `agent-portrait` gaze
          region and acknowledges being looked at. */}
      {activePersona ? (
        <AgentPresencePortrait
          personaId={activePersona.id}
          name={activePersona.name}
          hasPortrait={activePersona.hasPortrait}
          size="default"
        />
      ) : null}
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
      {activeThreadId ? (
        <div className="ml-auto shrink-0">
          <AgentAccessControl threadId={activeThreadId} />
        </div>
      ) : null}
    </div>
  )
}
