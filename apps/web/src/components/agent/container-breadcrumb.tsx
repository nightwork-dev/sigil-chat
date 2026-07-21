"use client"

// The container segment of the shell breadcrumb — and the container SWITCHER
// itself (§3.1, revised): the project and workspace crumbs are dropdown menus,
// so the "where am I" chain is also the "switch where I am" affordance. One
// control, no separate sidebar block. Read-only on principal-level routes
// (the segment omits itself there — those surfaces aren't container-scoped).
//
// Selection goes through useActiveContainer — shared with the omnibar, so
// chrome and keyboard paths can never disagree.

import { Link, useRouterState } from "@tanstack/react-router"
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
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

const PRINCIPAL_LEVEL_PREFIXES = [
  "/agents",
  "/capabilities",
  "/skills",
  "/demos",
]

export function ContainerBreadcrumb() {
  const container = useActiveContainer()
  const nav = useProjectWorkspaceNav()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (!container.isReady || !nav.data) return null
  if (PRINCIPAL_LEVEL_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const ownedWorkspaces = nav.data.workspaces.filter(
    (w) => w.projectId === container.projectId,
  )
  // Workspaces mounted into the current project: switchable here, labelled
  // as shared — entering one keeps this project as the via perspective.
  const mountedWorkspaces = nav.data.workspaces.filter(
    (w) =>
      w.projectId !== container.projectId &&
      w.mountedProjectIds.includes(container.projectId ?? ""),
  )
  const activeWorkspace = nav.data.workspaces.find(
    (w) => w.id === container.workspaceId,
  )
  // The workspace home link carries the entered-via perspective only when
  // the current project is not the workspace's canonical home (or that home
  // is hidden — projectId absent). Canonical entries carry no via.
  const workspaceHomeHref =
    container.workspaceId && container.projectId
      ? activeWorkspace?.projectId === container.projectId
        ? `/workspaces/${container.workspaceId}`
        : `/workspaces/${container.workspaceId}?via=${encodeURIComponent(container.projectId)}`
      : undefined

  return (
    <>
      <BreadcrumbItem>
        <ContainerMenu
          icon={
            nav.data.projects.find((p) => p.id === container.projectId)?.icon
          }
          label={container.projectName ?? "Personal"}
          href={
            container.projectId
              ? `/projects/${container.projectId}`
              : undefined
          }
          items={nav.data.projects.map((project) => ({
            id: project.id,
            label: project.name,
            icon: project.icon,
            active:
              project.id === container.projectId && !container.workspaceId,
            onSelect: () => container.selectProject(project.id),
          }))}
        />
      </BreadcrumbItem>

      {container.workspaceId ? (
        <>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <ContainerMenu
              icon={activeWorkspace?.icon}
              label={container.workspaceName ?? "Workspace"}
              href={workspaceHomeHref}
              items={[
                ...ownedWorkspaces.map((workspace) => ({
                  id: workspace.id,
                  label: workspace.name,
                  icon: workspace.icon,
                  active: workspace.id === container.workspaceId,
                  onSelect: () => container.selectWorkspace(workspace.id),
                })),
                ...mountedWorkspaces.map((workspace) => ({
                  id: workspace.id,
                  label: `${workspace.name} · Shared`,
                  icon: workspace.icon,
                  active: workspace.id === container.workspaceId,
                  onSelect: () => container.selectWorkspace(workspace.id),
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
          className="flex items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
          className="flex items-center rounded-sm px-0.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDownIcon className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {items.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={item.onSelect}>
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
