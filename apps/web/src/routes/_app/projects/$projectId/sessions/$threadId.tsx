// Route: /projects/$projectId/sessions/$threadId
// Tree:
//   apps/web/src/routes/__root.tsx                                  — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                                    — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx          — project layout, renders <Outlet/>
//   apps/web/src/routes/_app/projects/$projectId/sessions/$threadId.tsx — THIS FILE
// Content: SessionHome for a project-level (workspace-less) session — owned
// session output and explicitly linked durable commitments. The containing
// project is the path prefix; there is no workspace ancestor, so no
// "Shared from" ownership cue ever applies here (mirrors the prior
// workspace-less-thread behavior at /sessions/$threadId with no `via`).

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThread } from "@/lib/agent-threads"
import { useArtifacts } from "@/lib/artifacts"
import { useHomeSignals } from "@/lib/home-signals"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"
import { useSessionCommitments } from "@/lib/work-items"

export const Route = createFileRoute(
  "/_app/projects/$projectId/sessions/$threadId",
)({
  component: ProjectSessionHomeRoute,
})

function ProjectSessionHomeRoute() {
  const { threadId } = Route.useParams()
  const thread = useAgentThread(threadId)
  const nav = useProjectWorkspaceNav()
  const compact = useMediaQuery("(max-width: 640px)")
  const commitments = useSessionCommitments(threadId)
  const artifactScope = thread.data
    ? artifactScopeForHome("session", threadId)
    : null
  const artifacts = useArtifacts(artifactScope)
  const signals = useHomeSignals("session", threadId, Boolean(thread.data))

  const state: HomeState<SessionHomeView> = useMemo(() => {
    const homeThread = thread.data
    const homeNav = nav.data
    // A resolved-but-absent record is "not found"; the thread server fn is
    // permission-filtered, so absence reveals nothing either way.
    if (thread.isError || (homeThread && !nav.isLoading && !homeNav)) {
      return { kind: "not-found" }
    }
    if (
      !homeThread ||
      !homeNav ||
      (!commitments.data && !commitments.isError) ||
      (Boolean(artifactScope) && !artifacts.data && !artifacts.isError) ||
      (!signals.data && !signals.isError)
    ) {
      return { kind: "loading" }
    }
    if (commitments.isError) return { kind: "not-found" }
    const workspace = homeThread.workspaceId
      ? homeNav.workspaces.find((w) => w.id === homeThread.workspaceId)
      : undefined
    const sources = routeSources(
      [],
      liveWorkSource({
        sessionId: homeThread.id,
        sessionStories: commitments.data,
        nav: homeNav,
      }),
      {
        artifacts: artifactRowsFromRecords(artifacts.data ?? [], {
          scope: artifactScope ?? undefined,
        }),
        signals: signals.data,
      },
    )
    const view: SessionHomeView = {
      header: {
        scopeId: homeThread.id,
        kind: "session",
        name: homeThread.title,
        status: homeThread.status === "archived" ? "archived" : "active",
      },
      workspaceName: workspace?.name,
      ownership: undefined,
      artifacts: sources.artifacts,
      commitments: sources.work.commitmentsForSession(homeThread.id),
      activity: sources.activity,
      attention: sources.attention,
    }
    return { kind: "ready", view }
  }, [
    thread.data,
    thread.isError,
    nav.data,
    nav.isLoading,
    commitments.data,
    commitments.isError,
    artifacts.data,
    artifacts.isError,
    signals.data,
    signals.isError,
    artifactScope,
  ])

  return <SessionHome state={state} compact={compact} />
}
