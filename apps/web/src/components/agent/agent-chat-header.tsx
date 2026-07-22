import { useState, type ReactNode } from "react"
import {
  GitForkIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"

import { useAttention } from "@zigil/agent-react/attention"
import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import {
  isAgentSessionBusy,
  type AgentRuntimeSession,
} from "@zigil/agent-surface/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { cn } from "@workspace/ui/lib/utils"

import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"
import { ContextTray } from "@/components/agent/context-tray"
import { ProjectWorkspaceNav } from "@/components/agent/project-workspace-nav"
import { SessionBlackboard } from "@/components/agent/session-blackboard"
import { AgentPortrait } from "@/components/agents/agent-portrait"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentRoster, type AgentPersonaSummary } from "@/lib/agent-profile"
import { deriveThreadProjectId } from "@/lib/agent-thread-containers"
import { useAgentThreads, useCreateAgentThread } from "@/lib/agent-threads"
import type { ToolApprovalMode } from "@/lib/agent-tool-approval"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"

export function agentChatHeaderClasses(
  variant: "surface" | "rail",
  showLeading: boolean,
): string {
  return cn(
    "flex min-w-0 items-center gap-3",
    variant === "rail" && "flex-1",
    variant === "surface" && "shrink-0 border-b border-border px-3 py-2",
    showLeading ? "justify-between" : "justify-end",
  )
}

export function AgentChatHeader({
  approvalMode,
  onApprovalModeChange,
  session: providedSession,
  showApprovalMode = true,
  showContextPrivacy = true,
  showNewSession = true,
  showStatusIndicator = true,
  statusLine = null,
  variant = "surface",
}: {
  session?: AgentRuntimeSession
  statusLine?: ReactNode
  showContextPrivacy?: boolean
  showApprovalMode?: boolean
  showNewSession?: boolean
  showStatusIndicator?: boolean
  approvalMode?: ToolApprovalMode
  onApprovalModeChange?: (mode: ToolApprovalMode) => void
  variant?: "surface" | "rail"
}) {
  const session = useAppAgentSession(providedSession)
  const personaId = useAgentPersonaSession()
  const roster = useAgentRoster()
  const personaName = roster.data?.find(
    (persona) => persona.id === personaId,
  )?.name
  const attention = useAttention()
  const threadControls = useAgentThreadControls()
  const busy = isAgentSessionBusy(session)
  const showStatus = showStatusIndicator || statusLine !== null
  const showLeading = showStatus || threadControls !== null

  const activeThreads = useAgentThreads()
  const projectNav = useProjectWorkspaceNav()
  const activeThreadSummary = activeThreads.data?.find(
    (thread) => thread.id === threadControls?.activeThreadId,
  )
  let activeContainers:
    | { workspaceId: string | undefined; projectId: string }
    | undefined
  if (activeThreadSummary && projectNav.data) {
    const nav = projectNav.data
    const projectId = deriveThreadProjectId(
      activeThreadSummary,
      {
        getWorkspaceProjectId: (id) =>
          nav.workspaces.find((workspace) => workspace.id === id)?.projectId,
      },
      nav.personalProjectId,
    )
    activeContainers = {
      workspaceId: activeThreadSummary.workspaceId,
      projectId,
    }
  }

  return (
    <div className={agentChatHeaderClasses(variant, showLeading)}>
      {showLeading ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {showStatus && showStatusIndicator ? (
            <AgentStatusIndicator status={session.status} />
          ) : null}
          {showStatus && statusLine ? (
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              {statusLine}
            </span>
          ) : null}
          {threadControls ? (
            <AgentSessionSwitcher
              busy={busy}
              controls={threadControls}
              personaName={personaName ?? personaId ?? undefined}
            />
          ) : null}
        </div>
      ) : null}
      {showContextPrivacy || showApprovalMode || showNewSession ? (
        <div className="flex shrink-0 items-center gap-1">
          {threadControls?.activeThreadId ? (
            <SessionBlackboard
              projectId={activeContainers?.projectId}
              sessionId={threadControls.activeThreadId}
              workspaceId={activeContainers?.workspaceId}
            />
          ) : null}
          {showContextPrivacy ? (
            <ContextTray.Root attention={attention}>
              <ContextTray.Trigger className="max-sm:h-11" />
              <ContextTray.Content />
            </ContextTray.Root>
          ) : null}
          {showApprovalMode && approvalMode && onApprovalModeChange ? (
            <Select
              onValueChange={(value) => {
                if (value) onApprovalModeChange(value as ToolApprovalMode)
              }}
              value={approvalMode}
            >
              <SelectTrigger
                aria-label="Tool approval mode"
                className="max-sm:h-11"
                size="sm"
                title="Tool approval mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="ask">Ask</SelectItem>
                <SelectItem value="always">Always allow</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {showNewSession ? (
            threadControls ? (
              <>
                <Button
                  aria-label="Create semantic fork"
                  className="max-sm:size-11"
                  disabled={busy}
                  onClick={() => void threadControls.forkActiveThread()}
                  size="icon-xs"
                  title="Semantic fork from visible transcript"
                  variant="ghost"
                >
                  <GitForkIcon />
                </Button>
                <NewSessionPersonaPicker busy={busy} />
              </>
            ) : (
              <Button
                aria-label="Start a new session"
                className="max-sm:size-11"
                onClick={() => session.reset?.()}
                size="icon-xs"
                title="New session"
                variant="ghost"
              >
                <RotateCcwIcon />
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function NewSessionPersonaPicker({ busy }: { busy: boolean }) {
  const [open, setOpen] = useState(false)
  const roster = useAgentRoster()
  const createThread = useCreateAgentThread()
  const disabled = busy || createThread.isPending

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            aria-label="Create agent session"
            className="max-sm:size-11"
            size="icon-xs"
            title="New session"
            variant="ghost"
          />
        }
      >
        <PlusIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-2">
        <PopoverHeader className="px-2 pb-1 pt-1">
          <PopoverTitle>Choose an agent</PopoverTitle>
        </PopoverHeader>
        {roster.isPending ? (
          <p className="px-2 py-3 text-muted-foreground">Loading agents…</p>
        ) : roster.isError ? (
          <p className="px-2 py-3 text-destructive">Agents are unavailable.</p>
        ) : roster.data.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground">
            No agents are available.
          </p>
        ) : (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {roster.data.map((persona) => (
              <PersonaPickerItem
                disabled={disabled}
                key={persona.id}
                onSelect={() =>
                  createThread.mutate(
                    { personaId: persona.id },
                    { onSuccess: () => setOpen(false) },
                  )
                }
                persona={persona}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function PersonaPickerItem({
  disabled,
  onSelect,
  persona,
}: {
  disabled: boolean
  onSelect: () => void
  persona: AgentPersonaSummary
}) {
  return (
    <button
      className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <AgentPortrait
        personaId={persona.id}
        name={persona.name}
        hasPortrait={persona.hasPortrait}
        className="size-9"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{persona.name}</span>
        <span className="line-clamp-1 text-muted-foreground">
          {persona.description || persona.id}
        </span>
      </span>
    </button>
  )
}

function AgentSessionSwitcher({
  busy,
  controls,
  personaName,
}: {
  busy: boolean
  controls: NonNullable<ReturnType<typeof useAgentThreadControls>>
  personaName?: string
}) {
  const activeThread = controls.threads.find(
    (thread) => thread.id === controls.activeThreadId,
  )
  const threads = useAgentThreads()

  return (
    <Sheet>
      <SheetTrigger
        disabled={busy}
        render={
          <Button
            aria-label="Open conversation history"
            className="w-full min-w-0 max-w-full justify-start overflow-hidden px-2 max-sm:size-11 max-sm:px-0"
            size="sm"
            title={activeThread?.title ?? "Conversation history"}
            variant="ghost"
          />
        }
      >
        <MessageSquareTextIcon />
        <span className="min-w-0 truncate max-sm:sr-only">
          {personaName ? `${personaName} · ` : ""}
          {activeThread?.title ?? "Conversation history"}
        </span>
      </SheetTrigger>
      <SheetContent
        className="flex w-[min(22rem,calc(100vw-1rem))] flex-col"
        side="left"
      >
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <ProjectWorkspaceNav
          activeThreadId={controls.activeThreadId}
          busy={busy}
          onSelectThread={(threadId) => void controls.selectThread(threadId)}
          threads={threads.data ?? []}
        />
      </SheetContent>
    </Sheet>
  )
}

export function AgentStatusIndicator({
  showLabel = true,
  status,
}: {
  showLabel?: boolean
  status: AgentRuntimeSession["status"]
}) {
  const label = status === "submitted" ? "waiting" : status
  const busy = status === "streaming" || status === "submitted"

  return (
    <span aria-label={`Agent ${label}`} title={`Agent ${label}`}>
      <StatusDot
        label={showLabel ? label : undefined}
        pulse={busy ? "pulse" : false}
        status={
          status === "error" ? "destructive" : busy ? "primary" : "success"
        }
      />
    </span>
  )
}
