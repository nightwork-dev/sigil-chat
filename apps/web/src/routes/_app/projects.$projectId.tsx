// Route: /projects/$projectId — Project Home (SC.7).
// Presentation layer only: nav summary + thread list flow through the
// feature-local adapter; scoped work comes from the fixture source until
// SC.5's durable board query lands behind the same seam.

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { buildProjectHome } from "@/features/homes/home-view-model"
import { fixtureWorkSource } from "@/features/homes/fixtures"
import { ProjectHome } from "@/features/homes/project-home"
import type { HomeState, ProjectHomeView } from "@/features/homes/types"

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectHomeRoute,
})

function ProjectHomeRoute() {
  const { projectId } = Route.useParams()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")

  const state: HomeState<ProjectHomeView> = useMemo(() => {
    if (!nav.data || !threads.data) return { kind: "loading" }
    const view = buildProjectHome(
      {
        nav: nav.data,
        threads: threads.data,
        work: fixtureWorkSource,
        agents: (roster.data ?? []).map((persona) => ({
          personaId: persona.id,
          name: persona.name,
          headline: persona.description,
        })),
      },
      projectId,
    )
    // The nav summary is permission-filtered; an absent project means either
    // hidden or nonexistent — existence is not discoverable, so: 404 rule.
    return view ? { kind: "ready", view } : { kind: "not-found" }
  }, [nav.data, threads.data, roster.data, projectId])

  return <ProjectHome state={state} compact={compact} />
}
