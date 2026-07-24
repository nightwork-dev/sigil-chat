// Route: /projects/$projectId/workspaces/$workspaceId (index)
// Tree:
//   apps/web/src/routes/__root.tsx                                              — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                                                — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx                      — project layout
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/route.tsx — workspace layout, renders <Outlet/>
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/index.tsx — THIS FILE
// Content: WorkspaceHome — permission-filtered initiative composition. The
// entered-via project is the `$projectId` path segment (containment moved
// out of `?via=` and into the URL — SC.10 §2). Loader: once the parent
// layout's access check resolves "readable", warms the scoped work,
// artifacts, and home signals this view reads.
//
// Container slugs (SC.10, CRITICAL BOUNDARY): both $projectId and
// $workspaceId are either the canonical slug or a legacy/UUID id. This leaf
// owns the full, unambiguous param set for both, so it's the one that
// redirects to the canonical slug URL when either differs. Every scope-keyed
// query below is built from the resolved CANONICAL workspace id — a slug
// must never reach the work-items scope-access surface.

import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { artifactsQueryOptions, useArtifacts } from "@/lib/artifacts"
import {
  resolveProjectRouteParam,
  resolveWorkspaceRouteParam,
} from "@/lib/container-route-target"
import { homeSignalsQueryOptions, useHomeSignals } from "@/lib/home-signals"
import {
  projectWorkspaceNavQueryOptions,
  useProjectWorkspaceNav,
} from "@/lib/project-workspace-nav"
import {
  buildWorkspaceHome,
  type HomesAdapterInput,
} from "@/features/homes/home-view-model"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { WorkspaceHome } from "@/features/homes/workspace-home"
import type { HomeState, WorkspaceHomeView } from "@/features/homes/types"
import {
  scopeHomeAccessQueryOptions,
  scopeWorkQueryOptions,
  useScopeHomeAccess,
  useScopeWork,
} from "@/lib/work-items"

export const Route = createFileRoute(
  "/_app/projects/$projectId/workspaces/$workspaceId/",
)({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    const nav = await context.queryClient
      .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
      .catch(() => undefined)
    const resolvedProject = resolveProjectRouteParam(nav, params.projectId)
    const resolvedWorkspace = resolveWorkspaceRouteParam(
      nav,
      params.workspaceId,
    )
    if (
      (resolvedProject && resolvedProject.slug !== params.projectId) ||
      (resolvedWorkspace && resolvedWorkspace.slug !== params.workspaceId)
    ) {
      throw redirect({
        to: "/projects/$projectId/workspaces/$workspaceId",
        params: {
          projectId: resolvedProject?.slug ?? params.projectId,
          workspaceId: resolvedWorkspace?.slug ?? params.workspaceId,
        },
      })
    }
    const workspaceId = resolvedWorkspace?.id ?? params.workspaceId
    const access = await context.queryClient
      .ensureQueryData(scopeHomeAccessQueryOptions(principalId, workspaceId))
      .catch(() => undefined)
    if (access !== "readable") return
    const scope = artifactScopeForHome("workspace", workspaceId)
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          scopeWorkQueryOptions(principalId, workspaceId, "self"),
        )
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(artifactsQueryOptions(scope))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(
          homeSignalsQueryOptions(principalId, "workspace", workspaceId),
        )
        .catch(() => undefined),
    ])
  },
  component: WorkspaceHomeRoute,
})

function WorkspaceHomeRoute() {
  const { projectId: routeProjectId, workspaceId: routeWorkspaceId } =
    Route.useParams()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
  // The route params may still be slugs mid-redirect, or (transiently)
  // legacy UUIDs — resolve against the already-fetched nav the same way the
  // loader did (cache hit).
  const via =
    resolveProjectRouteParam(nav.data, routeProjectId)?.id ?? routeProjectId
  const workspaceId =
    resolveWorkspaceRouteParam(nav.data, routeWorkspaceId)?.id ??
    routeWorkspaceId
  const access = useScopeHomeAccess(workspaceId)
  const scopedWork = useScopeWork(
    workspaceId,
    "self",
    access.data === "readable",
  )
  const artifactScope =
    access.data === "readable"
      ? artifactScopeForHome("workspace", workspaceId)
      : null
  const artifacts = useArtifacts(artifactScope)
  const signals = useHomeSignals(
    "workspace",
    workspaceId,
    access.data === "readable",
  )

  const state: HomeState<WorkspaceHomeView> = useMemo(() => {
    const homeNav = nav.data
    const homeThreads = threads.data
    if (access.data === "denied") {
      return { kind: "denied", discoverable: true }
    }
    if (access.data === "not-found" || access.isError) {
      return { kind: "not-found" }
    }
    if (
      !homeNav ||
      !homeThreads ||
      !access.data ||
      (!scopedWork.data && !scopedWork.isError) ||
      (Boolean(artifactScope) && !artifacts.data && !artifacts.isError) ||
      (!signals.data && !signals.isError)
    ) {
      return { kind: "loading" }
    }
    if (scopedWork.isError) return { kind: "not-found" }
    const sources = routeSources(
      (roster.data ?? []).map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        headline: persona.description,
        hasPortrait: persona.hasPortrait,
      })),
      liveWorkSource({
        scopeId: workspaceId,
        scopeStories: scopedWork.data?.items.map(({ story }) => story),
        nav: homeNav,
      }),
      {
        resources: artifactRowsFromRecords(artifacts.data ?? [], {
          scope: artifactScope ?? undefined,
        }),
        signals: signals.data,
        viaProjectId: via,
      },
    )
    const input: HomesAdapterInput = {
      nav: homeNav,
      threads: homeThreads,
      work: sources.work,
      agents: sources.agents,
      resources: sources.resources,
      activity: sources.activity,
      attention: sources.attention,
    }
    const view = buildWorkspaceHome(input, workspaceId, via)
    return view ? { kind: "ready", view } : { kind: "not-found" }
  }, [
    nav.data,
    threads.data,
    roster.data,
    scopedWork.data,
    scopedWork.isError,
    artifacts.data,
    artifacts.isError,
    signals.data,
    signals.isError,
    artifactScope,
    access.data,
    access.isError,
    workspaceId,
    via,
  ])

  return <WorkspaceHome state={state} compact={compact} />
}
