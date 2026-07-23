"use client"

// SC.10 §9.2/§9.5 step 1 — the persistent session-list pane. Promotion, not
// authoring: `ProjectWorkspaceNav` already existed (built for the header
// Sheet); this renders the SAME component into the sidebar's `sidebarSecondary`
// slot (below the principal nav, above the account menu), always visible on
// desktop. It is the lateral-movement affordance §3 designed and §8 wrongly
// deferred — the owner's browser verdict (§9) overturned that deferral. The
// Sheet (`AgentSessionSwitcher` in agent-chat-header.tsx) stays as the
// 375px form; this pane does not replace it, it adds the desktop one.

import { isAgentSessionBusy } from "@zigil/agent-surface/contracts"
import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"

import { ProjectWorkspaceNav } from "@/components/agent/project-workspace-nav"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentThreads } from "@/lib/agent-threads"

export function SessionListPane() {
  const session = useAppAgentSession()
  const threadControls = useAgentThreadControls()
  const threads = useAgentThreads()

  // No active agent session yet (still restoring, or outside AppAgentSessions'
  // provider tree) — nothing to list.
  if (!threadControls) return null

  return (
    <ProjectWorkspaceNav
      activeThreadId={threadControls.activeThreadId}
      busy={isAgentSessionBusy(session)}
      onSelectThread={(threadId) => void threadControls.selectThread(threadId)}
      threads={threads.data ?? []}
    />
  )
}
