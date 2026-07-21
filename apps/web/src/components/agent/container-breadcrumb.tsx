"use client"

// The container segment of the shell breadcrumb — and the container SWITCHER
// itself (§3.1, revised): the project and workspace crumbs are dropdown menus,
// so the "where am I" chain is also the "switch where I am" affordance. One
// control, no separate sidebar block. Read-only on principal-level routes
// (the segment omits itself there — those surfaces aren't container-scoped).
//
// Selection goes through useActiveContainer — shared with the omnibar, so
// chrome and keyboard paths can never disagree.

import { useRouterState } from "@tanstack/react-router"
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

const PRINCIPAL_LEVEL_PREFIXES = ["/agents", "/capabilities", "/skills", "/studio"]

export function ContainerBreadcrumb() {
  const container = useActiveContainer()
  const nav = useProjectWorkspaceNav()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (!container.isReady || !nav.data) return null
  if (PRINCIPAL_LEVEL_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const workspacesInProject = nav.data.workspaces.filter(
    (w) => w.projectId === container.projectId,
  )

  return (
    <>
      <BreadcrumbItem>
        <ContainerMenu
          icon={nav.data.projects.find((p) => p.id === container.projectId)?.icon}
          label={container.projectName ?? "Personal"}
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
              icon={workspacesInProject.find((w) => w.id === container.workspaceId)?.icon}
              label={container.workspaceName ?? "Workspace"}
              items={workspacesInProject.map((workspace) => ({
                id: workspace.id,
                label: workspace.name,
                icon: workspace.icon,
                active: workspace.id === container.workspaceId,
                onSelect: () => container.selectWorkspace(workspace.id),
              }))}
            />
          </BreadcrumbItem>
        </>
      ) : null}

      <BreadcrumbSeparator />
    </>
  )
}

function ContainerMenu({
  icon,
  label,
  items,
}: {
  icon?: string
  label: string
  items: ReadonlyArray<{
    id: string
    label: string
    icon?: string
    active: boolean
    onSelect: () => void
  }>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span className="max-w-36 truncate">{label}</span>
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
  )
}
