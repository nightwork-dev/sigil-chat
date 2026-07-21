// Route: /workspaces/$workspaceId?via=<projectId>
// Tree:
//   apps/web/src/routes/__root.tsx                       — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                         — one-rail product shell, breadcrumb via-path, theme picker
//   apps/web/src/routes/_app/workspaces.$workspaceId.tsx — THIS FILE
// Content: WorkspaceHome — permission-filtered initiative composition with validated via display

import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { useAgentRoster } from "@/lib/agent-profile"
import { useMediaQuery } from "@/lib/agent-surface-registry"
import { useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import {
  buildWorkspaceHome,
  type HomesAdapterInput,
} from "@/features/homes/home-view-model"
import { fixtureNav, fixtureThreads } from "@/features/homes/fixtures"
import { liveWorkSource, routeSources } from "@/features/homes/live-sources"
import { WorkspaceHome } from "@/features/homes/workspace-home"
import type { HomeState, WorkspaceHomeView } from "@/features/homes/types"
import { useScopeWork } from "@/lib/work-items"

export const Route = createFileRoute("/_app/workspaces/$workspaceId")({
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
  component: WorkspaceHomeRoute,
})

function WorkspaceHomeRoute() {
  const { workspaceId } = Route.useParams()
  const { via, fixtures } = Route.useSearch()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
  const scopedWork = useScopeWork(workspaceId, "self", !fixtures)

  const state: HomeState<WorkspaceHomeView> = useMemo(() => {
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
        scopeId: workspaceId,
        scopeStories: scopedWork.data?.items.map(({ story }) => story),
        nav: homeNav,
      }),
    )
    const input: HomesAdapterInput = {
      nav: homeNav,
      threads: homeThreads,
      work: sources.work,
      agents: sources.agents,
      resources: sources.resources,
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
    workspaceId,
    via,
    fixtures,
  ])

  return <WorkspaceHome state={state} compact={compact} />
}
