"use client"

// §3.1 — the Project ▸ Workspace switcher, composed into the SidebarShell's
// `workspaceSwitcher` slot. Compact affordance showing the active container;
// opens a popover with the project list and, under the chosen project, its
// workspaces. Selection goes through useActiveContainer, so the switcher, the
// omnibar, and every scoped surface share one selection (and one per-principal
// persisted preference).
//
// Scope honesty (spec §5): this is a *switching* surface only. Container
// creation/invites are deliberately absent — member management is gated on
// registry-mutation authz and lands in a follow-up.

import { useState } from "react"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  LoaderCircleIcon,
} from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { useActiveContainer } from "@/lib/active-container"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

export function WorkspaceSwitcher() {
  const container = useActiveContainer()
  const nav = useProjectWorkspaceNav()
  const [open, setOpen] = useState(false)
  // The project whose workspaces are listed in the popover — defaults to the
  // active project, local to the popover session (browsing ≠ selecting).
  const [browsedProjectId, setBrowsedProjectId] = useState<string>()

  const listedProjectId = browsedProjectId ?? container.projectId
  const workspacesInProject = (nav.data?.workspaces ?? []).filter(
    (w) => w.projectId === listedProjectId,
  )

  const label = container.workspaceName ?? container.projectName ?? "Personal"
  const sublabel = container.workspaceName ? container.projectName : undefined

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setBrowsedProjectId(undefined)
      }}
    >
      <PopoverTrigger
        aria-label="Switch project or workspace"
        className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-4">{label}</span>
          {sublabel ? (
            <span className="block truncate text-[10px] leading-3 text-muted-foreground">
              {sublabel}
            </span>
          ) : null}
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {!nav.data ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            Loading containers…
          </div>
        ) : (
          <>
            <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Projects
            </p>
            <div className="max-h-40 overflow-y-auto">
              {nav.data.projects.map((project) => {
                const browsing = project.id === listedProjectId
                const activeProject =
                  project.id === container.projectId && !container.workspaceId
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      setBrowsedProjectId(project.id)
                      container.selectProject(project.id)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      browsing && "text-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {activeProject ? (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {workspacesInProject.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Workspaces
                </p>
                <div className="max-h-40 overflow-y-auto">
                  {workspacesInProject.map((workspace) => {
                    const activeWorkspace =
                      workspace.id === container.workspaceId
                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => {
                          container.selectWorkspace(workspace.id)
                          setOpen(false)
                        }}
                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {workspace.name}
                        </span>
                        {activeWorkspace ? (
                          <CheckIcon className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
