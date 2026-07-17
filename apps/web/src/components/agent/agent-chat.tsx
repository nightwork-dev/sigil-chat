import { useCallback, useState, type ReactNode } from "react"
import {
  AlertTriangleIcon,
  GitForkIcon,
  PlusIcon,
  RotateCcwIcon,
  WrenchIcon,
} from "lucide-react"

import {
  isAgentSessionBusy,
  type AgentMessage,
  type AgentMessagePart,
  type AgentRuntimeSession,
  type AgentToolInputResponse,
} from "@zigil/agent-surface"
import { useAgentThreadControls } from "@zigil/agent-react"
import { useAttention } from "@zigil/agent-react"
import { ChatInput } from "@workspace/chat/components/chat-input"
import { ChatList } from "@workspace/chat/components/chat-list"
import { ChatMessage } from "@workspace/chat/components/chat-message"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { cn } from "@workspace/ui/lib/utils"

import { AuthorizationCard } from "@/components/agent/authorization-card"
import { ContextTray } from "@/components/agent/context-tray"
import { ToolCall } from "@/components/agent/tool-call"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import type { ToolApprovalMode } from "@/lib/agent-tool-approval"

export interface AgentChatProps {
  session?: AgentRuntimeSession
  placeholder?: string
  emptyState?: ReactNode
  statusLine?: ReactNode
  showContextPrivacy?: boolean
  showApprovalMode?: boolean
  showNewSession?: boolean
  showStatusIndicator?: boolean
  className?: string
  approvalMode?: ToolApprovalMode
  onApprovalModeChange?: (mode: ToolApprovalMode) => void
}

export function AgentChat({
  className,
  emptyState,
  placeholder = "Ask the agent…",
  session: providedSession,
  approvalMode,
  onApprovalModeChange,
  showContextPrivacy = true,
  showApprovalMode = true,
  showNewSession = true,
  showStatusIndicator = true,
  statusLine = null,
}: AgentChatProps) {
  const session = useAppAgentSession(providedSession)
  const attention = useAttention()
  const threadControls = useAgentThreadControls()
  const [input, setInput] = useState("")
  const busy = isAgentSessionBusy(session)
  const showStatus = showStatusIndicator || statusLine !== null

  const handleSend = useCallback(async () => {
    const message = input.trim()
    if (!message || busy) return
    setInput("")
    const result = await session.send({ message })
    if (result.status !== "succeeded") setInput(message)
  }, [busy, input, session])

  return (
    <div
      className={cn(
        "flex h-full min-w-0 max-w-full flex-col overflow-hidden",
        className,
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-border px-3 py-2",
          showStatus ? "justify-between" : "justify-end",
        )}
      >
        {showStatus ? (
          <div className="flex min-w-0 items-center gap-2">
            {showStatusIndicator ? (
              <AgentStatusIndicator status={session.status} />
            ) : null}
            {statusLine ? (
              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                {statusLine}
              </span>
            ) : null}
          </div>
        ) : null}
        {showContextPrivacy ||
        showApprovalMode ||
        showNewSession ||
        threadControls ? (
          <div className="flex shrink-0 items-center gap-1">
            {threadControls ? (
              <Select
                disabled={busy}
                onValueChange={(threadId) => {
                  if (threadId) void threadControls.selectThread(threadId)
                }}
                value={threadControls.activeThreadId}
              >
                <SelectTrigger
                  aria-label="Active agent session"
                  className="max-w-44 max-sm:h-11"
                  size="sm"
                  title="Active agent session"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {threadControls.threads.map((thread) => (
                    <SelectItem key={thread.id} value={thread.id}>
                      {thread.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <Button
                    aria-label="Create agent session"
                    className="max-sm:size-11"
                    disabled={busy}
                    onClick={() => void threadControls.createThread()}
                    size="icon-xs"
                    title="New session"
                    variant="ghost"
                  >
                    <PlusIcon />
                  </Button>
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
      </header>

      {session.error ? (
        <Alert
          className="rounded-none border-x-0 border-t-0 px-4 py-3"
          variant="destructive"
        >
          <AlertTriangleIcon />
          <AlertTitle>Agent request failed</AlertTitle>
          <AlertDescription>{session.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <ChatList>
        {session.data.messages.length === 0
          ? (emptyState ?? <DefaultEmptyConversation />)
          : null}
        {session.data.messages.map((message, index) => (
          <AgentMessage
            canRespond={!busy}
            isStreaming={
              session.status === "streaming" &&
              index === session.data.messages.length - 1
            }
            key={message.id}
            message={message}
            onAlwaysAllow={
              onApprovalModeChange
                ? () => onApprovalModeChange("always")
                : undefined
            }
            onInputResponses={async (inputResponses) => {
              await session.respondToToolInput?.(inputResponses)
            }}
          />
        ))}
      </ChatList>

      <ChatInput
        actionClassName="max-sm:size-11"
        disabled={session.status === "error"}
        isStreaming={busy}
        onChange={setInput}
        onSend={handleSend}
        onStop={session.stop}
        placeholder={placeholder}
        value={input}
      />
    </div>
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

function DefaultEmptyConversation() {
  return (
    <Empty className="mx-auto max-w-md border-0 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WrenchIcon className="size-4 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>An agent with application tools</EmptyTitle>
        <EmptyDescription>
          Ask about the current workspace, or tell the agent to use an available
          tool.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onAlwaysAllow,
  onInputResponses,
}: {
  canRespond: boolean
  isStreaming: boolean
  message: AgentMessage
  onAlwaysAllow?: () => void
  onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
}) {
  const text = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("")
  const thinking = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "reasoning" }> =>
        part.type === "reasoning",
    )
    .map((part) => part.text)
    .join("")
  const extraParts = message.parts.filter(
    (part) => part.type !== "text" && part.type !== "reasoning",
  )

  return (
    <div className={cn("min-w-0 max-w-full")}>
      {text || thinking ? (
        <ChatMessage
          content={text}
          isStreaming={isStreaming}
          role={message.role}
          thinking={thinking || undefined}
        />
      ) : null}
      {extraParts.length > 0 ? (
        <div className="mt-2 min-w-0 max-w-full space-y-2 border-l-2 border-muted-foreground/20 pl-3">
          {extraParts.map((part, index) => (
            <AgentPart
              canRespond={canRespond}
              key={
                part.type === "tool-call" ? part.id : `${part.type}:${index}`
              }
              onAlwaysAllow={onAlwaysAllow}
              onInputResponses={onInputResponses}
              part={part}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AgentPart({
  canRespond,
  onAlwaysAllow,
  onInputResponses,
  part,
}: {
  canRespond: boolean
  onAlwaysAllow?: () => void
  onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
  part: Exclude<AgentMessagePart, { type: "text" | "reasoning" }>
}) {
  if (part.type === "tool-call") {
    return (
      <ToolCall
        canRespond={canRespond}
        onAlwaysAllow={onAlwaysAllow}
        onInputResponses={onInputResponses}
        part={part}
      />
    )
  }

  if (part.type === "authorization") {
    return <AuthorizationCard part={part} />
  }

  return (
    <Card className="p-3" size="sm">
      Attached: {part.filename ?? part.mediaType}
    </Card>
  )
}
