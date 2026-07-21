// Route: /projects/$projectId[?fixtures=1]
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
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { buildProjectHome } from "@/features/homes/home-view-model"
import { fixtureNav, fixtureThreads } from "@/features/homes/fixtures"
import { liveWorkSource, routeSources } from "@/features/homes/live-sources"
import { ProjectHome } from "@/features/homes/project-home"
import type { HomeState, ProjectHomeView } from "@/features/homes/types"
import { useScopeWork } from "@/lib/work-items"

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { fixtures?: boolean } =>
    search.fixtures === "1" ||
    search.fixtures === "true" ||
    search.fixtures === true
      ? { fixtures: true }
      : {},
  component: ProjectHomeRoute,
})

function ProjectHomeRoute() {
  const { projectId } = Route.useParams()
  const { fixtures } = Route.useSearch()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
  const scopedWork = useScopeWork(projectId, "self-and-rollups", !fixtures)

  const state: HomeState<ProjectHomeView> = useMemo(() => {
    const homeNav = fixtures ? fixtureNav : nav.data
    const homeThreads = fixtures ? fixtureThreads : threads.data
    if (
      !homeNav ||
      !homeThreads ||
      (!fixtures && !scopedWork.data && !scopedWork.isError)
    ) {
      return { kind: "loading" }
    }
    if (!fixtures && scopedWork.isError) return { kind: "not-found" }
    const sources = routeSources(
      Boolean(fixtures),
      (roster.data ?? []).map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        headline: persona.description,
      })),
      liveWorkSource({
        scopeId: projectId,
        scopeStories: scopedWork.data?.items.map(({ story }) => story),
        nav: homeNav,
      }),
    )
    const view = buildProjectHome(
      {
        nav: homeNav,
        threads: homeThreads,
        work: sources.work,
        agents: sources.agents,
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
    projectId,
    fixtures,
  ])

  return <ProjectHome state={state} compact={compact} />
}
