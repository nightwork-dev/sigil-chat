import { useAgentThreadControls } from "@zigil/agent/react"

import { deriveThreadProjectId } from "@/lib/agent-thread-containers"
import { useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

/** The active thread's resolved project + bound workspace, for callers that
 *  need to scope a container-tiered surface (the blackboard's
 *  session/workspace/project tabs) to the currently open session. Extracted
 *  from `SessionChatHeader` (SC.10 §9.8) so both the composer's ＋ Add
 *  menu's "Session note" entry and any other container-aware surface share
 *  one resolution, not a copy each. */
export function useActiveThreadContainers():
  { workspaceId: string | undefined; projectId: string } | undefined {
  const threadControls = useAgentThreadControls()
  const activeThreads = useAgentThreads()
  const projectNav = useProjectWorkspaceNav()
  const activeThreadSummary = activeThreads.data?.find(
    (thread) => thread.id === threadControls?.activeThreadId,
  )
  if (!activeThreadSummary || !projectNav.data) return undefined
  const nav = projectNav.data
  return {
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
