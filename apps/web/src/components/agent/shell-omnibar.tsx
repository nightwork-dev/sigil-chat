// S1.9 — the omnibar (Cmd+K / "/"). The keyboard-first entry tier of the
// agent-omnipresence continuum: one input, reachable from every workspace.
//
// Three modes, all through the same palette:
// 1. Message the agent — type free text, Enter sends through the app-global
//    session (same thread as the dock + /chat), with the active workspace's
//    attention attached, then opens the dock so the response is visible.
//    No second session, no second transport (§3.3).
// 2. Switch project / workspace / session — the fluid-switching groups from
//    §3.3, sourced from useProjectWorkspaceNav + useAgentThreads.
// 3. Go to surface — the feature nav (Chat / Evidence / Review / …).
//
// Keyboard is input-focus-safe by construction: "/" is a single key, which
// @tanstack/react-hotkeys ignores while an input/textarea is focused; Mod+K
// and Escape fire everywhere (their defaults don't ignore inputs).

import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import { SendIcon, FolderIcon, MessageSquareIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/command"
import { appNav } from "@/lib/app-nav"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { useAgentThreads, useSetActiveAgentThread } from "@/lib/agent-threads"
import { useActiveContainer } from "@/lib/active-container"
import { openAgentHud } from "@/lib/agent-hud-open"

/** Where picking a project from the omnibar lands: its nested home, never
 *  `/chat` (SC.10 §2/§6 step 9 fix — a container pick is "go there", not
 *  "go chat"). Exported for testing. */
export function projectSwitchHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

/** Where picking a workspace from the omnibar lands: the nested workspace
 *  home under its own owning project when visible, else the currently
 *  active project — the same canonical-containment fallback the SC.10
 *  step-5 resolvers use (workspaces.$workspaceId.tsx). Never `/chat`.
 *  Undefined only when neither project id is known (no active container and
 *  the workspace's owner is hidden) — the caller skips navigation then
 *  rather than guessing. Exported for testing. */
export function workspaceSwitchHref(
  workspace: { readonly id: string; readonly projectId?: string },
  activeProjectId: string | undefined,
): string | undefined {
  const projectId = workspace.projectId ?? activeProjectId
  if (!projectId) return undefined
  return `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspace.id)}`
}

export function ShellOmnibar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  const session = useAppAgentSession()

  const projectNav = useProjectWorkspaceNav()
  const threads = useAgentThreads()
  const container = useActiveContainer()
  const setActiveThread = useSetActiveAgentThread()

  useHotkey("Mod+K", () => setOpen((prev) => !prev), {
    meta: { name: "Toggle command palette" },
  })
  useHotkey("/", () => setOpen(true), {
    meta: { name: "Open command palette" },
  })
  useHotkey("Escape", () => setOpen(false), {
    enabled: open,
    meta: { name: "Close command palette" },
  })

  function close() {
    setOpen(false)
    setQuery("")
  }

  function go(to: string) {
    close()
    void navigate({ to })
  }

  async function sendMessage(message: string) {
    const trimmed = message.trim()
    if (!trimmed) return
    close()
    // Same send path as the dock — useAppAgentSession serializes the active
    // workspace's attention into clientContext. The response lands in the one
    // app-global session; opening the HUD makes it visible.
    await session.send({ message: trimmed })
    openAgentHud()
  }

  const hasQuery = query.trim().length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
      title="Command palette"
      description="Message the agent, switch context, or jump to a workspace"
    >
      <Command shouldFilter={hasQuery ? false : true}>
        <CommandInput
          placeholder="Message the agent, or search workspaces…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>

          {/* Message mode — free text submits to the agent (§3.3). */}
          {hasQuery ? (
            <CommandGroup heading="Message the agent">
              <CommandItem onSelect={() => sendMessage(query)}>
                <SendIcon className="size-4 text-muted-foreground" />
                <span className="min-w-0 truncate">
                  Send: <span className="font-medium">{query.trim()}</span>
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">↵</span>
              </CommandItem>
            </CommandGroup>
          ) : null}

          {/* Session switching — threads in the ACTIVE workspace first
              (§3.3: sessions listed are scoped to the active workspace);
              selecting one activates it, not just navigates. */}
          {!hasQuery && threads.data && threads.data.length > 0 ? (
            <CommandGroup heading="Sessions">
              {threads.data
                .filter(
                  (thread) =>
                    !container.workspaceId ||
                    thread.workspaceId === container.workspaceId,
                )
                .slice(0, 5)
                .map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={thread.title}
                    onSelect={() => {
                      setActiveThread.mutate({ id: thread.id })
                      go("/chat")
                    }}
                  >
                    <MessageSquareIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 truncate">{thread.title}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}

          {/* Project switching (§3.3) — selects the active container (Level 1)
              AND lands on that container's home (SC.10 §2: the nested
              /projects/$projectId tree, not /chat — picking a container is
              "go there", not "go chat"). container.selectProject still fires
              as the persist-on-navigate write (SC.10 §6 step 7). */}
          {!hasQuery && projectNav.data ? (
            <CommandGroup heading="Projects">
              {projectNav.data.projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => {
                    container.selectProject(project.id)
                    go(projectSwitchHref(project.id))
                  }}
                >
                  <FolderIcon className="size-4 text-muted-foreground" />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {/* Workspace switching — the workspaces inside the active project.
              Lands on the nested workspace home; the prefix is the workspace's
              own owning project when visible, else the currently active
              project — the same canonical-containment resolution the SC.10
              step-5 resolvers use (workspaces.$workspaceId.tsx), since this
              list is itself already filtered to the active project. */}
          {!hasQuery && projectNav.data ? (
            <CommandGroup heading="Workspaces">
              {projectNav.data.workspaces
                .filter((w) => w.projectId === container.projectId)
                .map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={workspace.name}
                    onSelect={() => {
                      container.selectWorkspace(workspace.id)
                      const href = workspaceSwitchHref(
                        workspace,
                        container.projectId,
                      )
                      if (href) go(href)
                    }}
                  >
                    <FolderIcon className="size-4 text-muted-foreground" />
                    {workspace.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}

          {/* Surface navigation. */}
          <CommandGroup heading="Surfaces">
            {appNav.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.to}
                  value={item.label}
                  onSelect={() => go(item.to)}
                >
                  {Icon ? (
                    <Icon className="size-4 text-muted-foreground" />
                  ) : null}
                  {item.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
