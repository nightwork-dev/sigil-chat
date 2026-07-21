import { useMemo, useState } from "react"
import { CheckIcon, FolderIcon, LoaderCircleIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SheetClose } from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

import {
  deriveThreadProjectId,
  groupThreadsByWorkspace,
  type WorkspaceContainmentLookup,
} from "@/lib/agent-thread-containers"
import type { AgentThreadSummary } from "@/lib/agent-threads-domain"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

/**
 * Project switcher + workspace-grouped thread nav for the conversation
 * sheet (AgentSessionSwitcher). Single render site today, so this stays a
 * plain component rather than a Root/Parts compound — see the repo's
 * compound-component rule ("single-use components that only render in one
 * place" are exempt).
 */
export function ProjectWorkspaceNav({
  activeThreadId,
  busy,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string
  busy: boolean
  onSelectThread: (threadId: string) => void
  threads: readonly AgentThreadSummary[]
}) {
  const nav = useProjectWorkspaceNav()
  const [selectedProjectId, setSelectedProjectId] = useState<string>()

  const lookup: WorkspaceContainmentLookup = useMemo(() => {
    const byId = new Map((nav.data?.workspaces ?? []).map((w) => [w.id, w.projectId]))
    return { getWorkspaceProjectId: (id) => byId.get(id) }
  }, [nav.data?.workspaces])

  const activeProjectId =
    selectedProjectId ?? nav.data?.personalProjectId ?? undefined

  if (nav.isPending) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Loading projects…
      </div>
    )
  }
  if (nav.isError || !nav.data) {
    return (
      <p className="p-3 text-sm text-destructive">
        Projects could not be loaded.
      </p>
    )
  }

  const projectThreads = threads.filter(
    (thread) =>
      deriveThreadProjectId(thread, lookup, nav.data.personalProjectId) ===
      activeProjectId,
  )
  const workspacesInProject = nav.data.workspaces.filter(
    (workspace) => workspace.projectId === activeProjectId,
  )
  const grouped = groupThreadsByWorkspace(projectThreads)
  const unfiled = grouped.get(undefined) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-2">
        <Select
          onValueChange={(value) => value && setSelectedProjectId(value)}
          value={activeProjectId}
        >
          <SelectTrigger aria-label="Active project" className="w-full" size="sm">
            <FolderIcon className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {nav.data.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <nav
        aria-label="Agent conversations"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-2"
      >
        {workspacesInProject.map((workspace) => (
          <ThreadGroup
            activeThreadId={activeThreadId}
            busy={busy}
            key={workspace.id}
            label={workspace.name}
            onSelectThread={onSelectThread}
            threads={grouped.get(workspace.id) ?? []}
          />
        ))}
        {unfiled.length > 0 ? (
          <ThreadGroup
            activeThreadId={activeThreadId}
            busy={busy}
            label={workspacesInProject.length > 0 ? "Unfiled" : undefined}
            onSelectThread={onSelectThread}
            threads={unfiled}
          />
        ) : null}
      </nav>
    </div>
  )
}

function ThreadGroup({
  activeThreadId,
  busy,
  label,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string
  busy: boolean
  label?: string
  onSelectThread: (threadId: string) => void
  threads: readonly AgentThreadSummary[]
}) {
  if (threads.length === 0) return null

  return (
    <div className="space-y-1">
      {label ? (
        <p className="px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      {threads.map((thread) => {
        const active = thread.id === activeThreadId
        return (
          <SheetClose
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm leading-5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-muted text-foreground",
            )}
            disabled={busy}
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            render={<button type="button" />}
          >
            <span className="min-w-0 flex-1 whitespace-normal break-words">
              {thread.title}
            </span>
            {active ? (
              <CheckIcon className="mt-1 size-3.5 shrink-0 text-primary" />
            ) : null}
          </SheetClose>
        )
      })}
    </div>
  )
}
