// The /chat resolver's redirect-target computation (SC.10 §3.1/§6 step 8),
// extracted as pure functions so it's unit-testable without mocking
// TanStack Router or the server-fn/query-client stack. Both functions only
// ever emit a thread's `.slug` into a URL — never `.id` (session slugs,
// SC.10) — locked by session-route-target.test.ts.

import type { AgentThreadSummary } from "@/lib/agent-threads-domain"
import type { AgentThreadPreference } from "@/lib/agent-threads-domain"
import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

/** The active thread (by preference), falling back to the most recently
 *  updated one when there's no preference or it points at a thread that no
 *  longer exists (archived/deleted). Callers already guarantee `threads` is
 *  non-empty (agentThreadsQueryOptions(principalId, false) always resolves
 *  at least one). */
export function pickActiveThread(
  threads: readonly AgentThreadSummary[],
  activeThreadId: AgentThreadPreference["activeThreadId"] | undefined,
): AgentThreadSummary {
  const preferred = threads.find((thread) => thread.id === activeThreadId)
  if (preferred) return preferred
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export interface SessionRedirectTarget {
  readonly to: string
  readonly params: Record<string, string>
}

/** Where /chat redirects for a given resolved thread — the same canonical-
 *  containment resolution the route-level resolvers use, always keyed on
 *  the thread's slug. */
export function chatResolverRedirectTarget(
  target: Pick<AgentThreadSummary, "slug" | "workspaceId">,
  nav: ProjectWorkspaceNavSummary | undefined,
): SessionRedirectTarget {
  if (!nav) {
    return { to: "/sessions/$threadId", params: { threadId: target.slug } }
  }
  if (!target.workspaceId) {
    return {
      to: "/projects/$projectId/sessions/$threadId",
      params: { projectId: nav.personalProjectId, threadId: target.slug },
    }
  }
  const workspace = nav.workspaces.find((w) => w.id === target.workspaceId)
  if (!workspace) {
    // Not visible in the nav summary — let the shallow resolver sort it out
    // rather than guessing a project prefix.
    return { to: "/sessions/$threadId", params: { threadId: target.slug } }
  }
  return {
    to: "/projects/$projectId/workspaces/$workspaceId/sessions/$threadId",
    params: {
      projectId: workspace.projectId ?? nav.personalProjectId,
      workspaceId: workspace.id,
      threadId: target.slug,
    },
  }
}
