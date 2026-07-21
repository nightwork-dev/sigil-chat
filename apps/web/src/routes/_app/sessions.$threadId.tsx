// Route: /sessions/$threadId?via=<projectId> — Session Home (SC.7). What the
// session produced and which commitments are explicitly linked to it; it
// never pretends to own the resources it can see (spec §11.1).
//
// `via` is the entered-via perspective — a shareable display hint validated
// against the permission-filtered nav summary by the adapter, never a
// trusted authorization path (spec §7).

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThread } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { resolveViaLabel } from "@/features/homes/home-view-model"
import {
  fixtureArtifactRows,
  fixtureAttention,
  fixtureWorkSource,
} from "@/features/homes/fixtures"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"

export const Route = createFileRoute("/_app/sessions/$threadId")({
  validateSearch: (search: Record<string, unknown>): { via?: string } =>
    typeof search.via === "string" ? { via: search.via } : {},
  component: SessionHomeRoute,
})

function SessionHomeRoute() {
  const { threadId } = Route.useParams()
  const { via } = Route.useSearch()
  const thread = useAgentThread(threadId)
  const nav = useProjectWorkspaceNav()
  const compact = useMediaQuery("(max-width: 640px)")

  const state: HomeState<SessionHomeView> = useMemo(() => {
    // A resolved-but-absent record is "not found"; the thread server fn is
    // permission-filtered, so absence reveals nothing either way.
    if (thread.isError || (thread.data && !nav.isLoading && !nav.data)) {
      return { kind: "not-found" }
    }
    if (!thread.data || !nav.data) return { kind: "loading" }
    const workspace = thread.data.workspaceId
      ? nav.data.workspaces.find((w) => w.id === thread.data.workspaceId)
      : undefined
    // Entered-via is honored only against the session's home workspace and
    // only when the mount, the via project, and the workspace are visible.
    const ownership = thread.data.workspaceId
      ? resolveViaLabel(nav.data, thread.data.workspaceId, via)
      : undefined
    const view: SessionHomeView = {
      header: {
        scopeId: thread.data.id,
        kind: "session",
        name: thread.data.title,
        status: thread.data.status === "archived" ? "archived" : "active",
      },
      workspaceName: workspace?.name,
      ownership,
      artifacts: fixtureArtifactRows,
      commitments: fixtureWorkSource.commitmentsForSession(thread.data.id),
      attention: fixtureAttention,
    }
    return { kind: "ready", view }
  }, [thread.data, thread.isError, nav.data, nav.isLoading, via])

  return <SessionHome state={state} compact={compact} />
}
