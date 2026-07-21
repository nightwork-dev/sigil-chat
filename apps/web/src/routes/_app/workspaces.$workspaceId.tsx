// Route: /workspaces/$workspaceId?via=<projectId> — Workspace Home (SC.7).
//
// The `via` search param is the entered-via perspective: a shareable display
// hint, never a trusted authorization path (spec §7). The adapter honors it
// only when the workspace, the via project, AND the mount are all visible in
// the permission-filtered nav summary; anything else falls back to the
// canonical path with no hint a hidden scope exists.

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
import { routeSources } from "@/features/homes/live-sources"
import { WorkspaceHome } from "@/features/homes/workspace-home"
import type { HomeState, WorkspaceHomeView } from "@/features/homes/types"

export const Route = createFileRoute("/_app/workspaces/$workspaceId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { via?: string; fixtures?: boolean } => ({
    ...(typeof search.via === "string" ? { via: search.via } : {}),
    ...(search.fixtures === "1" || search.fixtures === true
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

  const state: HomeState<WorkspaceHomeView> = useMemo(() => {
    if (!nav.data || !threads.data) return { kind: "loading" }
    const sources = routeSources(
      Boolean(fixtures),
      (roster.data ?? []).map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        headline: persona.description,
      })),
    )
    const input: HomesAdapterInput = {
      nav: nav.data,
      threads: threads.data,
      work: sources.work,
      agents: sources.agents,
      resources: sources.resources,
      attention: sources.attention,
    }
    const view = buildWorkspaceHome(input, workspaceId, via)
    return view ? { kind: "ready", view } : { kind: "not-found" }
  }, [nav.data, threads.data, roster.data, workspaceId, via, fixtures])

  return <WorkspaceHome state={state} compact={compact} />
}
