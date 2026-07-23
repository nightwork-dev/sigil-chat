// Route: /projects/$projectId (index)
// Tree:
//   apps/web/src/routes/__root.tsx                         — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                            — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx — project layout, renders <Outlet/>
//   apps/web/src/routes/_app/projects/$projectId/index.tsx — THIS FILE
// Content: ProjectHome — permission-filtered project composition and scoped work
// Loader: once the parent layout's access check resolves "readable", warms
// the scoped work, artifacts, and home signals this view reads. Skips the
// prefetch entirely otherwise — those queries stay disabled client-side too.
//
// Container slugs (SC.10, CRITICAL BOUNDARY): $projectId is either the
// canonical slug or a legacy/UUID id. This leaf owns the full, unambiguous
// param set, so it's the one that redirects to the canonical slug URL when
// they differ. Every scope-keyed query below (scopeHomeAccessQueryOptions,
// scopeWorkQueryOptions, artifactScopeForHome, homeSignalsQueryOptions) is
// built from the resolved CANONICAL id — a slug must never reach the
// work-items scope-access surface.

import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { artifactsQueryOptions, useArtifacts } from "@/lib/artifacts"
import { resolveProjectRouteParam } from "@/lib/container-route-target"
import { homeSignalsQueryOptions, useHomeSignals } from "@/lib/home-signals"
import {
  projectWorkspaceNavQueryOptions,
  useProjectWorkspaceNav,
} from "@/lib/project-workspace-nav"
import { buildProjectHome } from "@/features/homes/home-view-model"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { ProjectHome } from "@/features/homes/project-home"
import type { HomeState, ProjectHomeView } from "@/features/homes/types"
import {
  scopeHomeAccessQueryOptions,
  scopeWorkQueryOptions,
  useScopeHomeAccess,
  useScopeWork,
} from "@/lib/work-items"

export const Route = createFileRoute("/_app/projects/$projectId/")({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    const nav = await context.queryClient
      .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
      .catch(() => undefined)
    const resolved = resolveProjectRouteParam(nav, params.projectId)
    if (resolved && resolved.slug !== params.projectId) {
      throw redirect({
        to: "/projects/$projectId",
        params: { projectId: resolved.slug },
      })
    }
    const projectId = resolved?.id ?? params.projectId
    const access = await context.queryClient
      .ensureQueryData(scopeHomeAccessQueryOptions(principalId, projectId))
      .catch(() => undefined)
    if (access !== "readable") return
    const scope = artifactScopeForHome("project", projectId)
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          scopeWorkQueryOptions(principalId, projectId, "self-and-rollups"),
        )
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(artifactsQueryOptions(scope))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(
          homeSignalsQueryOptions(principalId, "project", projectId),
        )
        .catch(() => undefined),
    ])
  },
  component: ProjectHomeRoute,
})

function ProjectHomeRoute() {
  const { projectId: routeProjectId } = Route.useParams()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
  // The route param may still be the slug that's about to redirect from a
  // stale render, or (transiently) a legacy UUID — resolve it against the
  // already-fetched nav the same way the loader did (cache hit).
  const projectId =
    resolveProjectRouteParam(nav.data, routeProjectId)?.id ?? routeProjectId
  const access = useScopeHomeAccess(projectId)
  const scopedWork = useScopeWork(
    projectId,
    "self-and-rollups",
    access.data === "readable",
  )
  const artifactScope =
    access.data === "readable"
      ? artifactScopeForHome("project", projectId)
      : null
  const artifacts = useArtifacts(artifactScope)
  const signals = useHomeSignals(
    "project",
    projectId,
    access.data === "readable",
  )

  const state: HomeState<ProjectHomeView> = useMemo(() => {
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
        scopeId: projectId,
        scopeStories: scopedWork.data?.items.map(({ story }) => story),
        nav: homeNav,
      }),
      {
        resources: artifactRowsFromRecords(artifacts.data ?? [], {
          scope: artifactScope ?? undefined,
        }),
        signals: signals.data,
        viaProjectId: projectId,
      },
    )
    const view = buildProjectHome(
      {
        nav: homeNav,
        threads: homeThreads,
        work: sources.work,
        agents: sources.agents,
        resources: sources.resources,
        activity: sources.activity,
        attention: sources.attention,
      },
      projectId,
    )
    // The nav summary is permission-filtered; an absent project means either
    // hidden or nonexistent — existence is not discoverable, so: 404 rule.
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
    projectId,
  ])

  return <ProjectHome state={state} compact={compact} />
}
