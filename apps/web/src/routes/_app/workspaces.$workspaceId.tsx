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
import { useArtifacts } from "@/lib/artifacts"
import { useHomeSignals } from "@/lib/home-signals"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
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
import { useScopeHomeAccess, useScopeWork } from "@/lib/work-items"

export const Route = createFileRoute("/_app/workspaces/$workspaceId")({
  validateSearch: (search: Record<string, unknown>): { via?: string } => ({
    ...(typeof search.via === "string" ? { via: search.via } : {}),
  }),
  component: WorkspaceHomeRoute,
})

function WorkspaceHomeRoute() {
  const { workspaceId } = Route.useParams()
  const { via } = Route.useSearch()
  const nav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const roster = useAgentRoster()
  const compact = useMediaQuery("(max-width: 640px)")
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
