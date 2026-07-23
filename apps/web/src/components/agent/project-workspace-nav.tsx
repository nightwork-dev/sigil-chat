import { useMemo, useState } from "react"
import { CheckIcon, FolderIcon, LoaderCircleIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import {
  deriveThreadProjectId,
  groupThreadsByWorkspace,
  type WorkspaceContainmentLookup,
} from "@/lib/agent-thread-containers"
import type { AgentThreadSummary } from "@/lib/agent-threads-domain"
import { useActiveContainer } from "@/lib/active-container"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

/**
 * Project switcher + workspace-grouped thread nav — the SC.10 §9.2
 * lateral-movement affordance. Two render sites now: a persistent pane
 * (session-list-pane.tsx, no Dialog ancestor) and the compact/mobile Sheet
 * form (AgentSessionSwitcher in agent-chat-header.tsx). Deliberately hook-free
 * of any Dialog/Sheet primitive itself — `onDismiss` is a plain callback the
 * Sheet caller wires to its own close, so this component never assumes a
 * Dialog root exists (scar: SheetClose here previously crashed the moment
 * ProjectWorkspaceNav was promoted out of the Sheet — "Cannot destructure
 * property 'store' of useDialogRootContext(...)" — see ThreadGroup below and
 * project-workspace-nav.test.tsx).
 */
export function ProjectWorkspaceNav({
  activeThreadId,
  busy,
  onDismiss,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string
  busy: boolean
  /** Called after a thread is selected, in addition to onSelectThread — the
   *  Sheet form uses this to close itself; the persistent pane omits it. */
  onDismiss?: () => void
  onSelectThread: (threadId: string) => void
  threads: readonly AgentThreadSummary[]
}) {
  const nav = useProjectWorkspaceNav()
  const container = useActiveContainer()
  const [selectedProjectId, setSelectedProjectId] = useState<string>()

  const lookup: WorkspaceContainmentLookup = useMemo(() => {
    const byId = new Map((nav.data?.workspaces ?? []).map((w) => [w.id, w.projectId]))
    return { getWorkspaceProjectId: (id) => byId.get(id) }
  }, [nav.data?.workspaces])

  // §3.2 — the global active container is the default filter (the chrome
  // switcher changes what this drawer shows); a local override still wins
  // for in-drawer browsing, and the personal project is the final fallback.
  const activeProjectId =
    selectedProjectId ??
    container.projectId ??
    nav.data?.personalProjectId ??
    undefined

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
            onDismiss={onDismiss}
            onSelectThread={onSelectThread}
            threads={grouped.get(workspace.id) ?? []}
          />
        ))}
        {unfiled.length > 0 ? (
          <ThreadGroup
            activeThreadId={activeThreadId}
            busy={busy}
            label={workspacesInProject.length > 0 ? "Unfiled" : undefined}
            onDismiss={onDismiss}
            onSelectThread={onSelectThread}
            threads={unfiled}
          />
        ) : null}
      </nav>
    </div>
  )
}

/** Exported for project-workspace-nav.test.tsx — the narrowest regression
 *  test for the Dialog-context crash: mount this with no Sheet/Dialog
 *  ancestor at all and assert it renders. It takes no context hooks, only
 *  props, so nothing here can ever depend on a Dialog root existing. */
export function ThreadGroup({
  activeThreadId,
  busy,
  label,
  onDismiss,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string
  busy: boolean
  label?: string
  onDismiss?: () => void
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
          <button
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm leading-5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-muted text-foreground",
            )}
            disabled={busy}
            key={thread.id}
            onClick={() => {
              onSelectThread(thread.id)
              onDismiss?.()
            }}
            type="button"
          >
            <span className="min-w-0 flex-1 whitespace-normal break-words">
              {thread.title}
            </span>
            {active ? (
              <CheckIcon className="mt-1 size-3.5 shrink-0 text-primary" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
