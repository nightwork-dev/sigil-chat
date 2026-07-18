import { useCallback, useState, type ReactNode } from "react"
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  FileIcon,
  GitForkIcon,
  MessageSquareTextIcon,
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
} from "@zigil/agent-surface/contracts"
import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import { getContextDraftScope } from "@zigil/agent-react/context-draft"
import { useAttention } from "@zigil/agent-react/attention"
import { ChatInput } from "@workspace/chat/components/chat-input"
import { ChatImage } from "@workspace/chat/components/chat-image"
import { ChatList } from "@workspace/chat/components/chat-list"
import { ChatMessage } from "@workspace/chat/components/chat-message"
import {
  useAttachments,
  type UploadedFile,
} from "@workspace/ui/hooks/use-attachments"
import { imageMediaTypeFromUrl } from "@workspace/ui/lib/image-url"
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { cn } from "@workspace/ui/lib/utils"

import { AuthorizationCard } from "@/components/agent/authorization-card"
import { ContextTray } from "@/components/agent/context-tray"
import { ToolCall } from "@/components/agent/tool-call"
import { GenerateImageRenderer } from "@/components/agent/image-tool-renderer"
import {
  registerToolRenderer,
  setDefaultToolRenderer,
  ToolCallSlot,
} from "@/components/agent/tool-renderer-registry"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useUploadAgentAttachment } from "@/lib/agent-attachments"
import {
  AGENT_SCOPE_HEADER,
  sessionResourceScope,
} from "@/lib/agent-session-scope"
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
  const showLeading = showStatus || threadControls !== null

  // Attachment queue lives in the reusable useAttachments core (INGRESS-CORES).
  // We inject the sigil-chat upload server fn; the hook owns the optimistic
  // "uploading → uploaded/error" list, the ready subset, and restore-on-failure.
  const uploadAttachment = useUploadAgentAttachment()
  const activeSessionScope =
    threadControls?.activeThreadId ?? getContextDraftScope()
  const activeResourceScope = sessionResourceScope(activeSessionScope)
  const uploadFile = useCallback(
    (file: File): Promise<UploadedFile> =>
      uploadAttachment.mutateAsync({
        file,
        scope: activeResourceScope,
      }),
    [activeResourceScope, uploadAttachment],
  )
  const {
    attachments,
    addFiles,
    addUrl,
    remove: removeAttachment,
    clear: clearAttachments,
    setAttachments,
    isUploading: attachmentsUploading,
    ready,
  } = useAttachments({ upload: uploadFile })

  // A pasted image URL is already usable — add it by reference (no upload).
  // Delivery to the model (inline vs. let the host fetch it) is handled
  // downstream in @zigil/agent-eve + the agent host middleware.
  const handleAttachUrl = useCallback(
    (url: string) => addUrl(url, { mediaType: imageMediaTypeFromUrl(url) }),
    [addUrl],
  )

  const handleSend = useCallback(async () => {
    const message = input.trim()
    if ((!message && ready.length === 0) || busy || attachmentsUploading) {
      return
    }
    const snapshot = attachments
    const outgoing = ready.map((attachment) => ({
      url: attachment.url,
      mediaType: attachment.mediaType,
      filename: attachment.filename,
    }))

    setInput("")
    clearAttachments()
    const result = await session.send({
      message,
      attachments: outgoing,
      headers: { [AGENT_SCOPE_HEADER]: activeResourceScope },
    })
    if (result.status !== "succeeded") {
      setInput(message)
      setAttachments(snapshot)
    }
    // Sent attachments ride in the durable eve transcript as file parts and
    // render from there (see AgentMessage) — no client-side overlay needed.
  }, [
    activeResourceScope,
    attachments,
    attachmentsUploading,
    busy,
    clearAttachments,
    input,
    ready,
    session,
    setAttachments,
  ])

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
          showLeading ? "justify-between" : "justify-end",
        )}
      >
        {showLeading ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showStatus && showStatusIndicator ? (
              <AgentStatusIndicator status={session.status} />
            ) : null}
            {showStatus && statusLine ? (
              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                {statusLine}
              </span>
            ) : null}
            {threadControls ? (
              <AgentSessionSwitcher busy={busy} controls={threadControls} />
            ) : null}
          </div>
        ) : null}
        {showContextPrivacy ||
        showApprovalMode ||
        showNewSession ? (
          <div className="flex shrink-0 items-center gap-1">
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
        attachments={attachments}
        disabled={session.status === "error" || attachmentsUploading}
        isStreaming={busy}
        onAttach={addFiles}
        onAttachUrl={handleAttachUrl}
        onChange={setInput}
        onRemoveAttachment={removeAttachment}
        onSend={handleSend}
        onStop={session.stop}
        placeholder={placeholder}
        value={input}
      />
    </div>
  )
}

function AgentSessionSwitcher({
  busy,
  controls,
}: {
  busy: boolean
  controls: NonNullable<ReturnType<typeof useAgentThreadControls>>
}) {
  const activeThread = controls.threads.find(
    (thread) => thread.id === controls.activeThreadId,
  )

  return (
    <Sheet>
      <SheetTrigger
        disabled={busy}
        render={
          <Button
            aria-label="Open conversation history"
            className="min-w-0 max-w-[min(28rem,50vw)] justify-start px-2 max-sm:size-11 max-sm:px-0"
            size="sm"
            title={activeThread?.title ?? "Conversation history"}
            variant="ghost"
          />
        }
      >
        <MessageSquareTextIcon />
        <span className="min-w-0 truncate max-sm:sr-only">
          {activeThread?.title ?? "Conversation history"}
        </span>
      </SheetTrigger>
      <SheetContent
        className="w-[min(22rem,calc(100vw-1rem))]"
        side="left"
      >
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <nav
          aria-label="Agent conversations"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2"
        >
          {controls.threads.map((thread) => {
            const active = thread.id === controls.activeThreadId
            return (
              <SheetClose
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm leading-5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-muted text-foreground",
                )}
                disabled={busy}
                key={thread.id}
                onClick={() => void controls.selectThread(thread.id)}
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
        </nav>
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
  // A text attachment rides in as its own text part (agent-eve emits
  // `Attached file: <name>\n\n```\n<body>\n``` `). The model reads it verbatim,
  // but rendering it inline would dump the whole file into the bubble — so peel
  // those out here and render a collapsible chip below instead. Display-only:
  // the model still receives the untouched text part.
  const attachmentTexts: Array<{ filename: string; body: string }> = []
  const text = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => {
      const attachment = parseTextAttachment(part.text)
      if (attachment) {
        attachmentTexts.push(attachment)
        return ""
      }
      return part.text
    })
    .join("")
  const thinking = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "reasoning" }> =>
        part.type === "reasoning",
    )
    .map((part) => part.text)
    .join("")
  // File parts (a user's attached images, or a file the model returns) now ride
  // in the durable transcript, so they render straight from the message — one
  // gallery, survives reload, no client-side overlay. Everything else
  // (tool calls, authorizations) renders in the bordered activity rail below.
  const fileParts = message.parts.filter(
    (part): part is Extract<AgentMessagePart, { type: "file" }> =>
      part.type === "file",
  )
  const otherParts = message.parts.filter(
    (part) =>
      part.type !== "text" && part.type !== "reasoning" && part.type !== "file",
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
      {fileParts.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          {fileParts.map((part, index) => (
            <AttachmentPreview
              filename={part.filename}
              key={`file:${index}`}
              mediaType={part.mediaType}
              size={fileParts.length > 1 ? "grid" : "default"}
              url={part.url}
            />
          ))}
        </div>
      ) : null}
      {attachmentTexts.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {attachmentTexts.map((attachment, index) => (
            <AttachmentTextChip
              body={attachment.body}
              filename={attachment.filename}
              key={`att-text:${index}`}
            />
          ))}
        </div>
      ) : null}
      {otherParts.length > 0 ? (
        <div className="mt-2 min-w-0 max-w-full space-y-2 border-l-2 border-muted-foreground/20 pl-3">
          {otherParts.map((part, index) => (
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

// sigil-chat's default tool renderer (the generic collapsible view). Register
// per-tool custom UI with registerToolRenderer(name, Renderer). See the sigil
// feature roadmap, Phase 1.
setDefaultToolRenderer(ToolCall)
registerToolRenderer("sigil-generate-image", GenerateImageRenderer)

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
      <ToolCallSlot
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

  if (part.type === "file") {
    return (
      <AttachmentPreview
        filename={part.filename}
        mediaType={part.mediaType}
        url={part.url}
      />
    )
  }

  return null
}

/** Shared inline rendering for a "file" part — a clickable image thumbnail
 *  (via ChatImage's lightbox) when the media type and served URL are both
 *  present, otherwise a filename card. Used for assistant-produced file parts
 *  (e.g. sigil-generate-image output) and for a user's sent attachments. */
function AttachmentPreview({
  filename,
  mediaType,
  size,
  url,
}: {
  filename?: string
  mediaType: string
  size?: "default" | "grid"
  url?: string
}) {
  if (mediaType.startsWith("image/") && url) {
    return <ChatImage alt={filename} size={size} url={url} />
  }
  return (
    <Card className="flex items-center gap-2 p-3" size="sm">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{filename ?? mediaType}</span>
    </Card>
  )
}

// Matches the exact shape agent-eve emits for a textual attachment. Anchored so
// a part that merely mentions a file (typed prose) never matches; the trailing
// `$` lets the greedy body span internal ``` fences to the final closing fence.
const TEXT_ATTACHMENT_PATTERN = /^Attached file: ([^\n]+)\n\n```\n([\s\S]*)\n```$/

function parseTextAttachment(
  value: string,
): { filename: string; body: string } | null {
  const match = TEXT_ATTACHMENT_PATTERN.exec(value)
  if (!match) return null
  return { filename: match[1], body: match[2] }
}

/** A textual attachment shown as a collapsed file chip (filename + line count),
 *  expandable to a scrollable body — instead of dumping the whole file into the
 *  message bubble. The model still receives the full text; this is display only. */
function AttachmentTextChip({
  body,
  filename,
}: {
  body: string
  filename: string
}) {
  const [open, setOpen] = useState(false)
  const lineCount = body.split("\n").length

  return (
    <Card className="min-w-0 max-w-full overflow-hidden p-0" size="sm">
      <button
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{filename}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <pre className="max-h-80 overflow-auto border-t border-border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap break-words">
          {body}
        </pre>
      ) : null}
    </Card>
  )
}
