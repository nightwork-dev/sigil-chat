// Route: /projects/$projectId[?fixtures=1] — Project Home (SC.7).
// Presentation layer only: nav summary + thread list flow through the
// feature-local adapter. Live data renders exactly what the durable
// projections serve (scoped work is empty until SC.5's board query lands);
// `?fixtures=1` is the explicit review flag that exercises rich states
// against the Northstar fixtures — never silent.

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { buildProjectHome } from "@/features/homes/home-view-model"
import { routeSources } from "@/features/homes/live-sources"
import { ProjectHome } from "@/features/homes/project-home"
import type { HomeState, ProjectHomeView } from "@/features/homes/types"

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { fixtures?: boolean } =>
    search.fixtures === "1" || search.fixtures === true
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

  const state: HomeState<ProjectHomeView> = useMemo(() => {
    if (!nav.data || !threads.data) return { kind: "loading" }
    const sources = routeSources(
      Boolean(fixtures),
      (roster.data ?? []).map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        headline: persona.description,
      })),
    )
    const view = buildProjectHome(
      {
        nav: nav.data,
        threads: threads.data,
        work: sources.work,
        agents: sources.agents,
        attention: sources.attention,
      },
      projectId,
    )
    // The nav summary is permission-filtered; an absent project means either
    // hidden or nonexistent — existence is not discoverable, so: 404 rule.
    return view ? { kind: "ready", view } : { kind: "not-found" }
  }, [nav.data, threads.data, roster.data, projectId, fixtures])

  return <ProjectHome state={state} compact={compact} />
}
