// Route: /projects/$projectId/workspaces/$workspaceId/sessions/$threadId
// Tree:
//   apps/web/src/routes/__root.tsx                                                        — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                                                          — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx                                — project layout
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/route.tsx        — workspace layout, renders <Outlet/>
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/sessions/$threadId.tsx — THIS FILE
// Content: SessionHome — owned session output and explicitly linked durable
// commitments. The entered-via project is the `$projectId` path segment
// (SC.10 §2); the "Shared from" ownership cue derives from it exactly as the
// prior `?via=` param did. Loader: warms the thread, its commitments,
// artifacts, and home signals.

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { agentThreadQueryOptions, useAgentThread } from "@/lib/agent-threads"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { artifactsQueryOptions, useArtifacts } from "@/lib/artifacts"
import { homeSignalsQueryOptions, useHomeSignals } from "@/lib/home-signals"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { resolveViaLabel } from "@/features/homes/home-view-model"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"
import {
  sessionCommitmentsQueryOptions,
  useSessionCommitments,
} from "@/lib/work-items"

export const Route = createFileRoute(
  "/_app/projects/$projectId/workspaces/$workspaceId/sessions/$threadId",
)({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    await context.queryClient
      .ensureQueryData(agentThreadQueryOptions(principalId, params.threadId))
      .catch(() => undefined)
    const scope = artifactScopeForHome("session", params.threadId)
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          sessionCommitmentsQueryOptions(principalId, params.threadId),
        )
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(artifactsQueryOptions(scope))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(
          homeSignalsQueryOptions(principalId, "session", params.threadId),
        )
        .catch(() => undefined),
    ])
  },
  component: SessionHomeRoute,
})

function SessionHomeRoute() {
  const { projectId: via, threadId } = Route.useParams()
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
    // Entered-via is honored only against the session's home workspace and
    // only when the mount, the via project, and the workspace are visible.
    const ownership = homeThread.workspaceId
      ? resolveViaLabel(homeNav, homeThread.workspaceId, via)
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
        viaProjectId: via,
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
      ownership,
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
    via,
  ])

  return <SessionHome state={state} compact={compact} />
}
