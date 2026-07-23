"use client"

// The container segment of the shell breadcrumb — and the container SWITCHER
// itself (§3.1, revised): the project, workspace, and session crumbs are
// dropdown menus, so the "where am I" chain is also the "switch where I am"
// affordance. One control, no separate sidebar block. Read-only on
// principal-level routes (the segment omits itself there — those surfaces
// aren't container-scoped).
//
// SC.10 §4/§5: the chain is derived from the matched ROUTE, not from a
// client-reconstructed via-path or a persisted preference. A route only
// renders here if it actually matches the nested
// projects/$projectId(/workspaces/$workspaceId)?(/sessions/$threadId)? tree —
// containment lives in the URL, full stop. `container.selectProject` /
// `selectWorkspace` are still called on selection, but only to persist
// "where I last was" for the /home redirect (SC.10 §6 step 7) — nothing here
// reads that preference back to decide what to render.

import { Link, useMatches, useNavigate } from "@tanstack/react-router"
import { CheckIcon, ChevronDownIcon, FolderIcon } from "lucide-react"

import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { useActiveContainer } from "@/lib/active-container"
import { useAgentThread, useAgentThreads } from "@/lib/agent-threads"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

const PROJECT_ROUTE_ID = "/_app/projects/$projectId"
const WORKSPACE_ROUTE_ID = "/_app/projects/$projectId/workspaces/$workspaceId"
const PROJECT_SESSION_ROUTE_ID = "/_app/projects/$projectId/sessions/$threadId"
const WORKSPACE_SESSION_ROUTE_ID =
  "/_app/projects/$projectId/workspaces/$workspaceId/sessions/$threadId"

export function ContainerBreadcrumb() {
  const matches = useMatches()
  const navigate = useNavigate()
  const container = useActiveContainer()
  const liveNav = useProjectWorkspaceNav()
  const threads = useAgentThreads()

  const projectMatch = matches.find((m) => m.routeId === PROJECT_ROUTE_ID)
  const workspaceMatch = matches.find((m) => m.routeId === WORKSPACE_ROUTE_ID)
  const sessionMatch = matches.find(
    (m) =>
      m.routeId === PROJECT_SESSION_ROUTE_ID ||
      m.routeId === WORKSPACE_SESSION_ROUTE_ID,
  )

  const nav = liveNav.data
  const sessionThreadId = sessionMatch
    ? (sessionMatch.params as { threadId: string }).threadId
    : undefined
  const liveSession = useAgentThread(sessionThreadId, Boolean(sessionMatch))

  // Not a container-scoped route at all (principal-level surfaces, /chat,
  // /home) — the segment omits itself.
  if (!projectMatch || !nav) return null

  const projectId = (projectMatch.params as { projectId: string }).projectId
  const workspaceId = workspaceMatch
    ? (workspaceMatch.params as { workspaceId: string }).workspaceId
    : undefined

  const activeProject = nav.projects.find((p) => p.id === projectId)
  const activeWorkspace = workspaceId
    ? nav.workspaces.find((w) => w.id === workspaceId)
    : undefined

  const ownedWorkspaces = nav.workspaces.filter(
    (w) => w.projectId === projectId,
  )
  // Workspaces mounted into the current project: switchable here, labelled
  // as shared — entering one keeps this project as the entered-via prefix.
  const mountedWorkspaces = nav.workspaces.filter(
    (w) => w.projectId !== projectId && w.mountedProjectIds.includes(projectId),
  )

  const projectHomeHref = `/projects/${projectId}`
  const workspaceHomeHref = workspaceId
    ? `/projects/${projectId}/workspaces/${workspaceId}`
    : undefined
  const sessionHomeHref = sessionThreadId
    ? workspaceId
      ? `/projects/${projectId}/workspaces/${workspaceId}/sessions/${sessionThreadId}`
      : `/projects/${projectId}/sessions/${sessionThreadId}`
    : undefined

  // Sibling sessions for the session switcher: within a workspace, other
  // threads homed in that same workspace; at project depth (workspace-less),
  // only the personal project homes workspace-less threads (mirrors
  // buildProjectHome's session predicate in home-view-model.ts).
  const siblingSessions = (threads.data ?? [])
    .filter((thread) =>
      workspaceId
        ? thread.workspaceId === workspaceId
        : !thread.workspaceId && projectId === nav.personalProjectId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const selectProject = (nextProjectId: string) => {
    container.selectProject(nextProjectId)
    void navigate({
      to: "/projects/$projectId",
      params: { projectId: nextProjectId },
    })
  }

  const selectWorkspace = (nextWorkspaceId: string) => {
    container.selectWorkspace(nextWorkspaceId)
    void navigate({
      to: "/projects/$projectId/workspaces/$workspaceId",
      params: { projectId, workspaceId: nextWorkspaceId },
    })
  }

  const selectSession = (nextThreadId: string) => {
    if (workspaceId) {
      void navigate({
        to: "/projects/$projectId/workspaces/$workspaceId/sessions/$threadId",
        params: { projectId, workspaceId, threadId: nextThreadId },
      })
    } else {
      void navigate({
        to: "/projects/$projectId/sessions/$threadId",
        params: { projectId, threadId: nextThreadId },
      })
    }
  }

  return (
    <>
      <BreadcrumbItem>
        <ContainerMenu
          icon={activeProject?.icon}
          label={activeProject?.name ?? "Personal"}
          href={projectHomeHref}
          items={nav.projects.map((project) => ({
            id: project.id,
            label: project.name,
            icon: project.icon,
            active: project.id === projectId,
            onSelect: () => selectProject(project.id),
          }))}
        />
      </BreadcrumbItem>

      {workspaceId ? (
        <>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <ContainerMenu
              icon={activeWorkspace?.icon}
              label={activeWorkspace?.name ?? "Workspace"}
              href={workspaceHomeHref}
              items={[
                ...ownedWorkspaces.map((workspace) => ({
                  id: workspace.id,
                  label: workspace.name,
                  icon: workspace.icon,
                  active: workspace.id === workspaceId,
                  onSelect: () => selectWorkspace(workspace.id),
                })),
                ...mountedWorkspaces.map((workspace) => ({
                  id: workspace.id,
                  label: `${workspace.name} · Shared`,
                  icon: workspace.icon,
                  active: workspace.id === workspaceId,
                  onSelect: () => selectWorkspace(workspace.id),
                })),
              ]}
            />
          </BreadcrumbItem>
        </>
      ) : null}

      {sessionMatch && sessionThreadId ? (
        <>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <ContainerMenu
              label={liveSession.data?.title ?? "Session"}
              href={sessionHomeHref}
              items={siblingSessions.map((thread) => ({
                id: thread.id,
                label: thread.title,
                active: thread.id === sessionThreadId,
                onSelect: () => selectSession(thread.id),
              }))}
            />
          </BreadcrumbItem>
        </>
      ) : null}

      <BreadcrumbSeparator />
    </>
  )
}

export function useContainerBreadcrumbPage(): string | undefined {
  const matches = useMatches()
  if (matches.some((m) => m.routeId === PROJECT_SESSION_ROUTE_ID))
    return "Session"
  if (matches.some((m) => m.routeId === WORKSPACE_SESSION_ROUTE_ID))
    return "Session"
  if (matches.some((m) => m.routeId === WORKSPACE_ROUTE_ID))
    return "Workspace Home"
  if (matches.some((m) => m.routeId === PROJECT_ROUTE_ID))
    return "Project Home"
  return undefined
}

/** Split control: the crumb LABEL navigates to the container's home (SC.7 —
 *  the breadcrumb is the via-path, and selecting a crumb lands on its home);
 *  the chevron opens the switcher menu. Two adjacent stops, both keyboard
 *  operable, so neither behavior hides behind the other. Exported for tests. */
export function ContainerMenu({
  icon,
  label,
  href,
  items,
}: {
  icon?: string
  label: string
  /** Home target for the crumb label; omitted renders the label inert. */
  href?: string
  items: ReadonlyArray<{
    id: string
    label: string
    icon?: string
    active: boolean
    onSelect: () => void
  }>
}) {
  return (
    <span className="flex items-center">
      {href ? (
        <Link
          to={href}
          data-testid="crumb-home-link"
          className="flex min-h-11 items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
        >
          {icon ? <span aria-hidden>{icon}</span> : null}
          <span className="max-w-36 truncate">{label}</span>
        </Link>
      ) : (
        <span className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          {icon ? <span aria-hidden>{icon}</span> : null}
          <span className="max-w-36 truncate">{label}</span>
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Switch ${label}`}
          className="flex size-11 items-center justify-center rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-auto md:px-0.5"
        >
          <ChevronDownIcon className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {items.map((item) => (
            <DropdownMenuItem key={item.id} onClick={item.onSelect}>
              {item.icon ? (
                <span className="mr-1.5">{item.icon}</span>
              ) : (
                <FolderIcon className="mr-1.5 size-3.5 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.active ? (
                <CheckIcon className="ml-auto size-3.5 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
