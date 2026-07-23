// Route: /sessions/$threadId?via=<projectId>  (RESOLVER)
// Tree:
//   apps/web/src/routes/__root.tsx                  — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                    — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/sessions.$threadId.tsx — THIS FILE
// Content: keeps old links, directly-granted access, and workspace-less
// sessions working (SC.10 §2). `beforeLoad` resolves the thread's canonical
// containment from the permission-filtered nav and `throw redirect`s into
// /projects/$projectId(/workspaces/$workspaceId)?/sessions/$threadId. A
// workspace-less thread's only home is the personal project, always visible.
// When the thread's workspace is visible but its owning project is not, this
// renders the session surface directly at this shallow depth (SC.10 §3.1/§6
// step 8: conversation column + SessionHome rail) — the honest home for
// that principal, not a placeholder.

import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo } from "react"

import { agentThreadQueryOptions, useAgentThread } from "@/lib/agent-threads"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useArtifacts } from "@/lib/artifacts"
import { useHomeSignals } from "@/lib/home-signals"
import {
  projectWorkspaceNavQueryOptions,
  useProjectWorkspaceNav,
} from "@/lib/project-workspace-nav"
import { resolveViaLabel } from "@/features/homes/home-view-model"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import type { HomeState, SessionHomeView } from "@/features/homes/types"
import { SessionChatSurface } from "@/components/agent/session-chat-surface"
import { useSessionCommitments } from "@/lib/work-items"

export const Route = createFileRoute("/_app/sessions/$threadId")({
  validateSearch: (search: Record<string, unknown>): { via?: string } => ({
    ...(typeof search.via === "string" ? { via: search.via } : {}),
  }),
  beforeLoad: async ({ context, params, search }) => {
    const principalId = context.user.id
    const [nav, thread] = await Promise.all([
      context.queryClient
        .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(agentThreadQueryOptions(principalId, params.threadId))
        .catch(() => undefined),
    ])
    if (!nav || !thread) return

    if (!thread.workspaceId) {
      // Workspace-less: the only home is the personal project, which is
      // always visible to its own principal.
      throw redirect({
        to: "/projects/$projectId/sessions/$threadId",
        params: { projectId: nav.personalProjectId, threadId: params.threadId },
      })
    }

    const workspace = nav.workspaces.find((w) => w.id === thread.workspaceId)
    if (!workspace) return // Workspace itself not visible — render shallow.

    const viaVisible =
      search.via &&
      nav.projects.some((p) => p.id === search.via) &&
      (workspace.projectId === search.via ||
        workspace.mountedProjectIds.includes(search.via))
    const targetProjectId = viaVisible ? search.via : workspace.projectId
    if (targetProjectId) {
      throw redirect({
        to: "/projects/$projectId/workspaces/$workspaceId/sessions/$threadId",
        params: {
          projectId: targetProjectId,
          workspaceId: thread.workspaceId,
          threadId: params.threadId,
        },
      })
    }
    // Owning project not visible — render shallow (workspace only, no
    // Project crumb).
  },
  component: SessionHomeRoute,
})

function SessionHomeRoute() {
  const { threadId } = Route.useParams()
  const { via } = Route.useSearch()
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

  return (
    <SessionChatSurface compact={compact} railState={state} threadId={threadId} />
  )
}
