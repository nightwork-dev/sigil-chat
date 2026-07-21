"use client"

// The container segment of the shell breadcrumb — and the container SWITCHER
// itself (§3.1, revised): the project and workspace crumbs are dropdown menus,
// so the "where am I" chain is also the "switch where I am" affordance. One
// control, no separate sidebar block. Read-only on principal-level routes
// (the segment omits itself there — those surfaces aren't container-scoped).
//
// Selection goes through useActiveContainer — shared with the omnibar, so
// chrome and keyboard paths can never disagree.

import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
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
import { fixtureNav, fixtureThreads } from "@/features/homes/fixtures"
import { useAgentThread } from "@/lib/agent-threads"
import {
  useProjectWorkspaceNav,
  type ProjectWorkspaceNavSummary,
} from "@/lib/project-workspace-nav"

const PRINCIPAL_LEVEL_PREFIXES = [
  "/agents",
  "/capabilities",
  "/skills",
  "/demos",
]

type HomeRoute =
  | { kind: "project"; projectId: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "session"; threadId: string }

function decodedSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseHomeRoute(pathname: string): HomeRoute | undefined {
  const match = pathname.match(/^\/(projects|workspaces|sessions)\/([^/]+)\/?$/)
  if (!match) return undefined
  const id = decodedSegment(match[2])
  if (match[1] === "projects") return { kind: "project", projectId: id }
  if (match[1] === "workspaces") return { kind: "workspace", workspaceId: id }
  return { kind: "session", threadId: id }
}

export function resolveHomeBreadcrumbSelection({
  route,
  nav,
  viaProjectId,
  sessionWorkspaceId,
}: {
  route: HomeRoute
  nav: ProjectWorkspaceNavSummary
  viaProjectId?: string
  sessionWorkspaceId?: string
}): { projectId?: string; workspaceId?: string } | undefined {
  if (route.kind === "project") {
    return nav.projects.some((project) => project.id === route.projectId)
      ? { projectId: route.projectId }
      : undefined
  }

  const workspaceId =
    route.kind === "workspace" ? route.workspaceId : sessionWorkspaceId
  const workspace = nav.workspaces.find((entry) => entry.id === workspaceId)
  if (!workspace) return undefined

  const visibleVia =
    viaProjectId &&
    nav.projects.some((project) => project.id === viaProjectId) &&
    (workspace.projectId === viaProjectId ||
      workspace.mountedProjectIds.includes(viaProjectId))
      ? viaProjectId
      : undefined

  return {
    projectId: visibleVia ?? workspace.projectId,
    workspaceId: workspace.id,
  }
}

export function ContainerBreadcrumb() {
  const container = useActiveContainer()
  const liveNav = useProjectWorkspaceNav()
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const homeRoute = parseHomeRoute(location.pathname)
  const searchParams = new URLSearchParams(location.href.split("?", 2)[1] ?? "")
  const fixtureValue = searchParams.get("fixtures")
  const fixtureMode = fixtureValue === "1" || fixtureValue === "true"
  const liveSession = useAgentThread(
    homeRoute?.kind === "session" ? homeRoute.threadId : undefined,
    homeRoute?.kind === "session" && !fixtureMode,
  )
  const nav = fixtureMode ? fixtureNav : liveNav.data
  const sessionWorkspaceId =
    homeRoute?.kind === "session"
      ? fixtureMode
        ? fixtureThreads.find((thread) => thread.id === homeRoute.threadId)
            ?.workspaceId
        : liveSession.data?.workspaceId
      : undefined
  const viaProjectId = searchParams.get("via") ?? undefined
  const homeSelection =
    homeRoute && nav
      ? resolveHomeBreadcrumbSelection({
          route: homeRoute,
          nav,
          viaProjectId,
          sessionWorkspaceId,
        })
      : undefined
  const projectId = homeRoute ? homeSelection?.projectId : container.projectId
  const workspaceId = homeRoute
    ? homeSelection?.workspaceId
    : container.workspaceId

  if ((!homeRoute && !container.isReady) || !nav) return null
  if (PRINCIPAL_LEVEL_PREFIXES.some((p) => location.pathname.startsWith(p)))
    return null
  // A home route must never fall back to a different persisted container while
  // its own permission-filtered record is loading or unavailable.
  if (homeRoute && !homeSelection) return null

  const ownedWorkspaces = nav.workspaces.filter(
    (w) => w.projectId === projectId,
  )
  // Workspaces mounted into the current project: switchable here, labelled
  // as shared — entering one keeps this project as the via perspective.
  const mountedWorkspaces = nav.workspaces.filter(
    (w) =>
      w.projectId !== projectId &&
      w.mountedProjectIds.includes(projectId ?? ""),
  )
  const activeWorkspace = nav.workspaces.find((w) => w.id === workspaceId)
  // The workspace home link carries the entered-via perspective only when
  // the current project is not the workspace's canonical home (or that home
  // is hidden — projectId absent). Canonical entries carry no via.
  const workspaceHomeHref =
    workspaceId && projectId
      ? activeWorkspace?.projectId === projectId
        ? `/workspaces/${workspaceId}${fixtureMode ? "?fixtures=1" : ""}`
        : `/workspaces/${workspaceId}?via=${encodeURIComponent(projectId)}${fixtureMode ? "&fixtures=1" : ""}`
      : undefined
  const projectHomeHref = projectId
    ? `/projects/${projectId}${fixtureMode ? "?fixtures=1" : ""}`
    : undefined

  const selectProject = (nextProjectId: string) => {
    container.selectProject(nextProjectId)
    if (homeRoute) {
      void navigate({
        to: "/projects/$projectId",
        params: { projectId: nextProjectId },
        search: fixtureMode ? { fixtures: true } : {},
      })
    }
  }

  const selectWorkspace = (nextWorkspaceId: string) => {
    container.selectWorkspace(nextWorkspaceId)
    if (!homeRoute) return
    const nextWorkspace = nav.workspaces.find(
      (workspace) => workspace.id === nextWorkspaceId,
    )
    const nextVia =
      projectId && nextWorkspace?.projectId !== projectId
        ? projectId
        : undefined
    void navigate({
      to: "/workspaces/$workspaceId",
      params: { workspaceId: nextWorkspaceId },
      search: {
        ...(nextVia ? { via: nextVia } : {}),
        ...(fixtureMode ? { fixtures: true } : {}),
      },
    })
  }

  return (
    <>
      <BreadcrumbItem>
        <ContainerMenu
          icon={nav.projects.find((p) => p.id === projectId)?.icon}
          label={
            nav.projects.find((project) => project.id === projectId)?.name ??
            "Personal"
          }
          href={projectHomeHref}
          items={nav.projects.map((project) => ({
            id: project.id,
            label: project.name,
            icon: project.icon,
            active: project.id === projectId && !workspaceId,
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

      <BreadcrumbSeparator />
    </>
  )
}

export function useContainerBreadcrumbPage(): string | undefined {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const route = parseHomeRoute(pathname)
  if (route?.kind === "project") return "Project Home"
  if (route?.kind === "workspace") return "Workspace Home"
  if (route?.kind === "session") return "Session"
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
