// Route: /projects/$projectId
// Tree:
//   apps/web/src/routes/__root.tsx                     — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                       — one-rail product shell, breadcrumb via-path, theme picker
//   apps/web/src/routes/_app/projects.$projectId.tsx   — THIS FILE
// Content: ProjectHome — permission-filtered project composition and scoped work

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { useArtifacts } from "@/lib/artifacts"
import { useHomeSignals } from "@/lib/home-signals"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { buildProjectHome } from "@/features/homes/home-view-model"
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "@/features/homes/live-sources"
import { ProjectHome } from "@/features/homes/project-home"
import type { HomeState, ProjectHomeView } from "@/features/homes/types"
import { useScopeHomeAccess, useScopeWork } from "@/lib/work-items"

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectHomeRoute,
})

function ProjectHomeRoute() {
  const { projectId } = Route.useParams()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
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
