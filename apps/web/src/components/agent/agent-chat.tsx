import { useCallback, useState, type ReactNode } from "react"
import { AlertTriangleIcon, WrenchIcon } from "lucide-react"

import {
  isAgentSessionBusy,
  type AgentRuntimeSession,
} from "@zigil/agent-surface/contracts"
import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import { getContextDraftScope } from "@zigil/agent-react/context-draft"
import { ChatInput } from "@workspace/chat/components/chat-input"
import { ChatList } from "@workspace/chat/components/chat-list"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"

import { AgentChatHeader } from "@/components/agent/agent-chat-header"
import { AgentTranscriptMessage } from "@/components/agent/agent-message"
import { useWorkspaceResourceScope } from "@/components/agent/workspace-attention"
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
  /** Suppress the built-in header row — a route hoisting the header into the
   *  shell's top rail (via AgentChatHeader in staticData.rail.top) sets this
   *  so the content region doesn't stack a second header under the rail. */
  hideHeader?: boolean
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
  hideHeader = false,
  showContextPrivacy = true,
  showApprovalMode = true,
  showNewSession = true,
  showStatusIndicator = true,
  statusLine = null,
}: AgentChatProps) {
  const session = useAppAgentSession(providedSession)
  const threadControls = useAgentThreadControls()
  const [input, setInput] = useState("")
  const busy = isAgentSessionBusy(session)

  const uploadAttachment = useUploadAgentAttachment()
  const activeSessionScope =
    threadControls?.activeThreadId ?? getContextDraftScope()
  const workspaceResourceScope = useWorkspaceResourceScope()
  const activeResourceScope =
    workspaceResourceScope ?? sessionResourceScope(activeSessionScope)
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
      {!hideHeader ? (
        <AgentChatHeader
          approvalMode={approvalMode}
          onApprovalModeChange={onApprovalModeChange}
          session={providedSession}
          showApprovalMode={showApprovalMode}
          showContextPrivacy={showContextPrivacy}
          showNewSession={showNewSession}
          showStatusIndicator={showStatusIndicator}
          statusLine={statusLine}
        />
      ) : null}
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
          <AgentTranscriptMessage
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
