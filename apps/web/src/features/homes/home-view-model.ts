// The feature-local adapter between the shared, authorization-neutral graph
// contract (apps/agent/agent/lib/scope-graph.ts) and the home components.
//
// Inputs are already permission-filtered projections: the nav summary omits
// scopes the principal cannot see and marks workspace `projectId` absent when
// the canonical home is hidden. This adapter's job is ORDERING and SHAPING —
// never recovery. It does not reconstruct hidden owners, does not substitute
// the personal scope for a hidden one, and treats every via path as a display
// hint to be validated against what is visible (spec §7).
//
// Link data arrives projected (`mountedProjectIds`); we re-materialize it as
// ScopeLink records so ordering and de-duplication run through the shared
// `traverseScopeLinks`/`sortScopeLinks` implementation rather than a
// feature-local sort that could drift from the contract.

import {
  sortScopeLinks,
  traverseScopeLinks,
  type ScopeLink,
} from "../../../../agent/agent/lib/scope-graph"

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"
import type { AgentThreadSummary } from "@/lib/agent-threads"

import type {
  ActivityItem,
  AgentRow,
  AttentionItem,
  HomeHeader,
  OwnershipLabel,
  ProjectHomeView,
  ResourceRow,
  ScopedWorkSource,
  SessionRow,
  WorkspaceHomeView,
  WorkspaceListRow,
} from "./types"

export interface HomesAdapterInput {
  readonly nav: ProjectWorkspaceNavSummary
  readonly threads: readonly AgentThreadSummary[]
  readonly work: ScopedWorkSource
  readonly agents?: readonly AgentRow[]
  readonly activity?: readonly ActivityItem[]
  readonly attention?: readonly AttentionItem[]
  readonly resources?: readonly ResourceRow[]
}

/** Re-materialize projected mounts as ordered ScopeLink records. Order is
 *  the target project's mount-list order; ids are deterministic per pair. */
export function scopeLinksFromNav(
  nav: ProjectWorkspaceNavSummary,
): ScopeLink[] {
  const links: ScopeLink[] = []
  for (const workspace of nav.workspaces) {
    workspace.mountedProjectIds.forEach((projectId, index) => {
      links.push({
        id: `${workspace.id}--mounted-in--${projectId}`,
        kind: "mounted-in",
        subjectScopeId: workspace.id,
        targetScopeId: projectId,
        order: index,
        createdAt: "",
        createdBy: "",
        revision: 0,
      })
    })
  }
  return sortScopeLinks(links)
}

function workspaceHref(workspaceId: string, viaProjectId?: string): string {
  return viaProjectId
    ? `/workspaces/${workspaceId}?via=${encodeURIComponent(viaProjectId)}`
    : `/workspaces/${workspaceId}`
}

function sessionHref(threadId: string, viaProjectId?: string): string {
  return viaProjectId
    ? `/sessions/${threadId}?via=${encodeURIComponent(viaProjectId)}`
    : `/sessions/${threadId}`
}

/** Workspaces participating in a project: owned first, then mounted in the
 *  contract's deterministic traversal order. A mounted row names its
 *  canonical owner ONLY when that owner is visible in the nav summary, and
 *  links out with this project as the entered-via perspective — so the path
 *  the person arrived by survives the click (spec §7). Owned rows enter
 *  canonically: no via. */
export function projectWorkspaceRows(
  nav: ProjectWorkspaceNavSummary,
  projectId: string,
): WorkspaceListRow[] {
  const links = scopeLinksFromNav(nav)
  const owned = nav.workspaces.filter(
    (workspace) => workspace.projectId === projectId,
  )
  const mountedIds = traverseScopeLinks({
    rootScopeId: projectId,
    kind: "mounted-in",
    direction: "subjects",
    links,
    includeRoot: false,
    maxDepth: 1,
  })
  const mounted = mountedIds
    .map((id) => nav.workspaces.find((workspace) => workspace.id === id))
    .filter((workspace): workspace is NonNullable<typeof workspace> =>
      Boolean(workspace),
    )
    .filter((workspace) => workspace.projectId !== projectId)

  const ownerName = (workspace: (typeof nav.workspaces)[number]) =>
    workspace.projectId
      ? nav.projects.find((project) => project.id === workspace.projectId)?.name
      : undefined

  const rows: WorkspaceListRow[] = owned.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    icon: workspace.icon,
    description: workspace.description,
    status: workspace.status,
    relation: "owned" as const,
    href: workspaceHref(workspace.id),
  }))
  for (const workspace of mounted) {
    rows.push({
      id: workspace.id,
      name: workspace.name,
      icon: workspace.icon,
      description: workspace.description,
      status: workspace.status,
      relation: "mounted" as const,
      canonicalOwnerName: ownerName(workspace),
      href: workspaceHref(workspace.id, projectId),
    })
  }
  return rows
}

function sessionRows(
  threads: readonly AgentThreadSummary[],
  nav: ProjectWorkspaceNavSummary,
  predicate: (thread: AgentThreadSummary) => boolean,
  viaForThread: (thread: AgentThreadSummary) => string | undefined = () =>
    undefined,
): SessionRow[] {
  return threads
    .filter(predicate)
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      personaId: thread.personaId,
      status:
        thread.status === "archived"
          ? ("archived" as const)
          : ("active" as const),
      updatedAt: thread.updatedAt,
      workspaceId: thread.workspaceId,
      workspaceName: thread.workspaceId
        ? nav.workspaces.find((w) => w.id === thread.workspaceId)?.name
        : undefined,
      href: sessionHref(thread.id, viaForThread(thread)),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/** The via to propagate when opening a thread from a project home: only
 *  when the thread's workspace is MOUNTED in (not homed in) this project. */
function mountedVia(
  nav: ProjectWorkspaceNavSummary,
  projectId: string,
  thread: AgentThreadSummary,
): string | undefined {
  const workspace = nav.workspaces.find((w) => w.id === thread.workspaceId)
  if (!workspace || workspace.projectId === projectId) return undefined
  return workspace.mountedProjectIds.includes(projectId) ? projectId : undefined
}

function projectHeader(
  nav: ProjectWorkspaceNavSummary,
  projectId: string,
): HomeHeader | undefined {
  const project = nav.projects.find((entry) => entry.id === projectId)
  if (!project) return undefined
  return {
    scopeId: project.id,
    kind: "project",
    name: project.name,
    icon: project.icon,
    description: project.description,
    status: "active",
  }
}

/** Build the Project Home view model, or undefined when the project is not
 *  visible at all (caller renders not-found/denied per the §7 rule). */
export function buildProjectHome(
  input: HomesAdapterInput,
  projectId: string,
): ProjectHomeView | undefined {
  const header = projectHeader(input.nav, projectId)
  if (!header) return undefined
  return {
    header,
    workspaces: projectWorkspaceRows(input.nav, projectId),
    sessions: sessionRows(
      input.threads,
      input.nav,
      (thread) => {
        if (!thread.workspaceId)
          return projectId === input.nav.personalProjectId
        const workspace = input.nav.workspaces.find(
          (w) => w.id === thread.workspaceId,
        )
        // Sessions of owned AND mounted workspaces are "happening here";
        // mounted ones keep this project as the entered-via perspective.
        return (
          workspace?.projectId === projectId ||
          Boolean(workspace?.mountedProjectIds.includes(projectId))
        )
      },
      (thread) => mountedVia(input.nav, projectId, thread),
    ),
    agents: input.agents ?? [],
    resources: input.resources ?? [],
    work: input.work.summariesForScope(projectId),
    activity: input.activity ?? [],
    attention: input.attention ?? [],
  }
}

/** Resolve the entered-via project for a workspace home. Presentation only:
 *  the via is honored when (a) the workspace is visible, (b) the via project
 *  is visible, and (c) a mount or canonical relationship actually exists in
 *  the visible data. Anything else falls back to the visible canonical path
 *  with no hint that a hidden scope exists (spec §7). */
export function resolveViaLabel(
  nav: ProjectWorkspaceNavSummary,
  workspaceId: string,
  viaProjectId: string | undefined,
): OwnershipLabel | undefined {
  const workspace = nav.workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return undefined
  const canonicalProject = workspace.projectId
    ? nav.projects.find((p) => p.id === workspace.projectId)
    : undefined

  const viaVisible =
    viaProjectId !== undefined &&
    viaProjectId !== workspace.projectId &&
    nav.projects.some((p) => p.id === viaProjectId) &&
    workspace.mountedProjectIds.includes(viaProjectId)

  if (!viaVisible) return undefined
  return {
    enteredViaName: nav.projects.find((p) => p.id === viaProjectId)?.name,
    enteredViaScopeId: viaProjectId,
    canonicalOwnerName: canonicalProject?.name,
  }
}

export function buildWorkspaceHome(
  input: HomesAdapterInput,
  workspaceId: string,
  viaProjectId?: string,
): WorkspaceHomeView | undefined {
  const workspace = input.nav.workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return undefined
  return {
    header: {
      scopeId: workspace.id,
      kind: "workspace",
      name: workspace.name,
      icon: workspace.icon,
      description: workspace.description,
      status: workspace.status,
    },
    ownership: resolveViaLabel(input.nav, workspaceId, viaProjectId),
    sessions: sessionRows(
      input.threads,
      input.nav,
      (thread) => thread.workspaceId === workspaceId,
      () => {
        const ownership = resolveViaLabel(input.nav, workspaceId, viaProjectId)
        return ownership?.enteredViaScopeId
      },
    ),
    agents: input.agents ?? [],
    resources: input.resources ?? [],
    work: input.work.summariesForScope(workspaceId),
    activity: input.activity ?? [],
    attention: input.attention ?? [],
  }
}
