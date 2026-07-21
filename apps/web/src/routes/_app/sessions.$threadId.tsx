// Route: /sessions/$threadId?via=<projectId>
// Tree:
//   apps/web/src/routes/__root.tsx                  — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                    — one-rail product shell, breadcrumb via-path, theme picker
//   apps/web/src/routes/_app/sessions.$threadId.tsx — THIS FILE
// Content: SessionHome — owned session output and explicitly linked durable commitments

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThread } from "@/lib/agent-threads"
import { useArtifacts } from "@/lib/artifacts"
import { useHomeSignals } from "@/lib/home-signals"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { resolveViaLabel } from "@/features/homes/home-view-model"
import { fixtureNav, fixtureThreads } from "@/features/homes/fixtures"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { SessionHome } from "@/features/homes/session-home"
import type { HomeState, SessionHomeView } from "@/features/homes/types"
import { useSessionCommitments } from "@/lib/work-items"

export const Route = createFileRoute("/_app/sessions/$threadId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { via?: string; fixtures?: boolean } => ({
    ...(typeof search.via === "string" ? { via: search.via } : {}),
    ...(search.fixtures === "1" ||
    search.fixtures === "true" ||
    search.fixtures === true
      ? { fixtures: true }
      : {}),
  }),
  component: SessionHomeRoute,
})

function SessionHomeRoute() {
  const { threadId } = Route.useParams()
  const { via, fixtures } = Route.useSearch()
  const thread = useAgentThread(threadId, !fixtures)
  const nav = useProjectWorkspaceNav()
  const compact = useMediaQuery("(max-width: 640px)")
  const commitments = useSessionCommitments(threadId, !fixtures)
  const artifactScope =
    !fixtures && thread.data ? artifactScopeForHome("session", threadId) : null
  const artifacts = useArtifacts(artifactScope)
  const signals = useHomeSignals(
    "session",
    threadId,
    !fixtures && Boolean(thread.data),
  )

  const state: HomeState<SessionHomeView> = useMemo(() => {
    const homeThread = fixtures
      ? fixtureThreads.find((candidate) => candidate.id === threadId)
      : thread.data
    const homeNav = fixtures ? fixtureNav : nav.data
    // A resolved-but-absent record is "not found"; the thread server fn is
    // permission-filtered, so absence reveals nothing either way.
    if (
      (!fixtures && thread.isError) ||
      (homeThread && !fixtures && !nav.isLoading && !homeNav)
    ) {
      return { kind: "not-found" }
    }
    if (
      !homeThread ||
      !homeNav ||
      (!fixtures && !commitments.data && !commitments.isError) ||
      (!fixtures &&
        Boolean(artifactScope) &&
        !artifacts.data &&
        !artifacts.isError) ||
      (!fixtures && !signals.data && !signals.isError)
    ) {
      return { kind: "loading" }
    }
    if (!fixtures && commitments.isError) return { kind: "not-found" }
    const workspace = homeThread.workspaceId
      ? homeNav.workspaces.find((w) => w.id === homeThread.workspaceId)
      : undefined
    // Entered-via is honored only against the session's home workspace and
    // only when the mount, the via project, and the workspace are visible.
    const ownership = homeThread.workspaceId
      ? resolveViaLabel(homeNav, homeThread.workspaceId, via)
      : undefined
    const sources = routeSources(
      Boolean(fixtures),
      [],
      liveWorkSource({
        sessionId: homeThread.id,
        sessionStories: commitments.data,
        nav: homeNav,
      }),
      {
        artifacts: artifactRowsFromRecords(artifacts.data ?? []),
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
    threadId,
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
    fixtures,
  ])

  return <SessionHome state={state} compact={compact} />
}
