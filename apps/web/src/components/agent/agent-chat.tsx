import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { AlertTriangleIcon, WrenchIcon } from "lucide-react"

import {
  isAgentSessionBusy,
  type AgentRuntimeSession,
  type AgentToolInputResponse,
} from "@zigil/agent/contracts"
import {
  getContextDraftScope,
  useAgentThreadControls,
} from "@zigil/agent/react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ToneChip } from "@workspace/ui/components/tone-chip"
import { cn } from "@workspace/ui/lib/utils"

import { AddMenu } from "@/components/agent/add-menu"
import { AgentChatHeader } from "@/components/agent/agent-chat-header"
import { AgentTranscriptMessage } from "@/components/agent/agent-message"
import { ComposerModelControl } from "@/components/agent/composer-model-control"
import { ComposerVoiceControl } from "@/components/agent/voice-composer-control"
import { LiveVoiceComposerControl } from "@/components/agent/live-voice-composer-control"
import { VoiceConversationControl } from "@/components/agent/voice-conversation-control"
import { useWorkspaceResourceScope } from "@/components/agent/workspace-attention"
import { useActiveThreadContainers } from "@/hooks/use-active-thread-containers"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentThread } from "@/lib/agent-threads"
import { useUploadAgentAttachment } from "@/lib/agent-attachments"
import { appendDictationDraft } from "@/lib/voice-dictation"
import { useSpeakReplies } from "@/lib/agent-preferences"
import { useSpokenAgentReplies } from "@/lib/spoken-replies"
import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"
import type { VoiceBoundThread } from "@/lib/voice-session-binding"
import type { WorkspaceResourceCandidate } from "@/lib/add-sources"
import {
  AGENT_SCOPE_HEADER,
  sessionResourceScope,
} from "@/lib/agent-session-scope"
import type { ToolApprovalMode } from "@/lib/agent-tool-approval"
import { isAtWordBoundary } from "@/lib/mention-trigger"
import {
  buildToolInputResponseBatch,
  collectPendingToolInputRequests,
  toolInputBatchKey,
} from "@zigil/agent/agent-tool-input-batch"

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
  const pendingToolInputRequests = useMemo(
    () => collectPendingToolInputRequests(session.data.messages),
    [session.data.messages],
  )
  const pendingToolInputBatchKey = useMemo(
    () => toolInputBatchKey(pendingToolInputRequests),
    [pendingToolInputRequests],
  )
  const pendingToolInputRequestIds = useMemo(
    () => new Set(pendingToolInputRequests.map((request) => request.requestId)),
    [pendingToolInputRequests],
  )
  const [toolInputBatchState, setToolInputBatchState] = useState<{
    batchKey: string
    queuedRequestIds: readonly string[]
    submittedRequestIds: readonly string[]
  }>({ batchKey: "", queuedRequestIds: [], submittedRequestIds: [] })
  const toolInputDraftResponses = useRef<readonly AgentToolInputResponse[]>([])
  const toolInputSubmittedRequestIds = useRef(new Set<string>())
  const toolInputBatchKeyRef = useRef("")
  const activeQueuedToolInputRequestIds = useMemo(
    () =>
      new Set(
        toolInputBatchState.batchKey === pendingToolInputBatchKey
          ? toolInputBatchState.queuedRequestIds
          : [],
      ),
    [pendingToolInputBatchKey, toolInputBatchState],
  )
  const activeSubmittedToolInputRequestIds = useMemo(
    () =>
      new Set(
        toolInputBatchState.batchKey === pendingToolInputBatchKey
          ? toolInputBatchState.submittedRequestIds
          : [],
      ),
    [pendingToolInputBatchKey, toolInputBatchState],
  )
  const canRespondToToolInput =
    Boolean(session.capabilities.toolInput) &&
    typeof session.respondToToolInput === "function"
  const canRespondToInputRequest = useCallback(
    (requestId: string) =>
      canRespondToToolInput &&
      !busy &&
      pendingToolInputRequestIds.has(requestId) &&
      !activeQueuedToolInputRequestIds.has(requestId) &&
      !activeSubmittedToolInputRequestIds.has(requestId),
    [
      activeQueuedToolInputRequestIds,
      activeSubmittedToolInputRequestIds,
      busy,
      canRespondToToolInput,
      pendingToolInputRequestIds,
    ],
  )
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const blackboardContainers = useActiveThreadContainers()

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

  // The thread a live dictation binds to. `/sessions/$threadSlug` is the
  // resolver route, so one link from anywhere lands on this thread's
  // canonical containment without this component guessing at it.
  const activeThreadId = threadControls?.activeThreadId
  const activeThread = useAgentThread(activeThreadId, Boolean(activeThreadId))
  const voiceThread: VoiceBoundThread | undefined = activeThread.data
    ? {
        threadId: activeThread.data.id,
        threadSlug: activeThread.data.slug,
        title: activeThread.data.title,
      }
    : undefined

  // Dictation ADDS to whatever is in the composer; it never replaces typing.
  const handleDictationDraft = useCallback((text: string) => {
    setInput((current) => appendDictationDraft(current, text))
  }, [])

  // Voice conversation is per-session and starts off. The durable "speak
  // replies" preference turns on only the speaking half — a user who wants to
  // hear answers while still typing their questions gets that without
  // auto-send, which is the half that can send words they did not mean.
  const [conversationMode, setConversationMode] = useState(false)
  const speakRepliesPreference = useSpeakReplies()
  const personaId = useAgentPersonaSession()
  useSpokenAgentReplies({
    enabled: conversationMode || speakRepliesPreference,
    isStreaming: session.status === "streaming",
    messages: session.data.messages,
    personaId: personaId ?? undefined,
  })

  const handleAttachUrl = useCallback(
    (url: string) => addUrl(url, { mediaType: imageMediaTypeFromUrl(url) }),
    [addUrl],
  )

  const handleAttachResource = useCallback(
    (candidate: WorkspaceResourceCandidate) =>
      addUrl(candidate.url, {
        mediaType: candidate.mediaType,
        filename: candidate.filename,
        size: candidate.size,
      }),
    [addUrl],
  )

  // §9.8(c) — `@` at a word boundary opens the same Add menu the ＋ trigger
  // does (one popover, two triggers). We don't preventDefault: the `@`
  // still lands in the text normally, since this composer's a plain
  // textarea with no inline mention-chip rendering to replace it with.
  const handleComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "@") return
      const cursor = e.currentTarget.selectionStart
      if (isAtWordBoundary(e.currentTarget.value, cursor)) {
        setAddMenuOpen(true)
      }
    },
    [],
  )

  // Both the composer's Send and a voice-first dictation land here. Voice
  // passes its transcript directly rather than writing it into the composer
  // and sending "whatever is in there": the composer is a text field the user
  // may still be typing in, and a spoken turn must send the words that were
  // actually spoken.
  const submit = useCallback(
    async (message: string) => {
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
        // A failed voice turn falls back to the composer, where the words are
        // recoverable and editable — a spoken utterance that vanished on a
        // network error would be unrecoverable.
        setInput(message)
        setAttachments(snapshot)
      }
    },
    [
      activeResourceScope,
      attachments,
      attachmentsUploading,
      busy,
      clearAttachments,
      ready,
      session,
      setAttachments,
    ],
  )

  const handleSend = useCallback(() => submit(input.trim()), [input, submit])

  const handleVoiceSend = useCallback(
    (text: string) => {
      void submit(text.trim())
    },
    [submit],
  )

  const handleToolInputResponses = useCallback(
    async (inputResponses: readonly AgentToolInputResponse[]) => {
      if (!canRespondToToolInput || busy || !session.respondToToolInput) return
      if (toolInputBatchKeyRef.current !== pendingToolInputBatchKey) {
        toolInputBatchKeyRef.current = pendingToolInputBatchKey
        toolInputDraftResponses.current = []
        toolInputSubmittedRequestIds.current = new Set()
      }

      const update = buildToolInputResponseBatch({
        incomingResponses: inputResponses,
        pendingRequests: pendingToolInputRequests,
        queuedResponses: toolInputDraftResponses.current,
        submittedRequestIds: [...toolInputSubmittedRequestIds.current],
      })
      if (update.acceptedRequestIds.length === 0 && !update.batchResponses) {
        return
      }

      toolInputDraftResponses.current = update.queuedResponses
      if (!update.batchResponses) {
        setToolInputBatchState({
          batchKey: pendingToolInputBatchKey,
          queuedRequestIds: update.queuedResponses.map(
            (response) => response.requestId,
          ),
          submittedRequestIds: [...toolInputSubmittedRequestIds.current],
        })
        return
      }

      const submittedRequestIds = update.batchResponses.map(
        (response) => response.requestId,
      )
      toolInputDraftResponses.current = []
      toolInputSubmittedRequestIds.current = new Set([
        ...toolInputSubmittedRequestIds.current,
        ...submittedRequestIds,
      ])
      setToolInputBatchState({
        batchKey: pendingToolInputBatchKey,
        queuedRequestIds: [],
        submittedRequestIds: [...toolInputSubmittedRequestIds.current],
      })

      const result = await session.respondToToolInput(update.batchResponses)
      if (result.status !== "succeeded") {
        toolInputSubmittedRequestIds.current = new Set(
          [...toolInputSubmittedRequestIds.current].filter(
            (requestId) => !submittedRequestIds.includes(requestId),
          ),
        )
        setToolInputBatchState({
          batchKey: pendingToolInputBatchKey,
          queuedRequestIds: [],
          submittedRequestIds: [...toolInputSubmittedRequestIds.current],
        })
      }
    },
    [
      busy,
      canRespondToToolInput,
      pendingToolInputBatchKey,
      pendingToolInputRequests,
      session,
    ],
  )

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden",
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

      {/* SC.10 §9.3 — left-anchored, never centered: max-w-3xl caps the
          reading measure but carries NO mx-auto, so the content hugs this
          box's own left edge. The box itself stays flex-1 in the parent
          (session-chat-surface.tsx), so its left edge is fixed by the
          session list beside it, not by this width — toggling the context
          rail changes how much empty space sits to the right, never the
          left edge messages and the composer share. */}
      <ChatList className="max-w-3xl">
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
            canRespondToInputRequest={canRespondToInputRequest}
            onAlwaysAllow={
              onApprovalModeChange
                ? () => onApprovalModeChange("always")
                : undefined
            }
            onInputResponses={handleToolInputResponses}
          />
        ))}
      </ChatList>

      {/* §9.7 — one contained box, one control row: ChatInput owns its own
          border now (packages/chat restructure); this is just the same
          left-anchored max-w-3xl cap ChatList uses, plus matching spacing so
          the box's left edge lines up with the message content's own
          padding. The orphaned approval-Select row that used to sit above
          the input is gone — approval mode and the model label seat in
          ChatInput's control row instead (session surface only; a future
          non-session AgentChat caller keeps approval mode in its header,
          showApprovalMode there, untouched — additive, not a second copy). */}
      <ChatInput
        actionClassName="max-sm:size-11"
        attachments={attachments}
        className="mx-4 mb-4 max-w-3xl"
        disabled={session.status === "error" || attachmentsUploading}
        isStreaming={busy}
        leadingControls={
          hideHeader
            ? (controls) => (
                <>
                  {threadControls?.activeThreadId ? (
                    <AddMenu
                      artifactScope={activeResourceScope}
                      onAttachResource={handleAttachResource}
                      onOpenChange={setAddMenuOpen}
                      open={addMenuOpen}
                      openFilePicker={controls.openFilePicker}
                      projectId={blackboardContainers?.projectId}
                      sessionId={threadControls.activeThreadId}
                      workspaceId={blackboardContainers?.workspaceId}
                    />
                  ) : null}
                  {showApprovalMode && approvalMode && onApprovalModeChange ? (
                    <ApprovalChip
                      mode={approvalMode}
                      onChange={onApprovalModeChange}
                    />
                  ) : null}
                </>
              )
            : undefined
        }
        trailingControls={
          <>
            {/* MDL.5 — unconditional, in both header modes and at every
                width. Its predecessors (a label rendered only when the
                header was hidden, plus reasoning chips that vanish for a
                model declaring no tunables) meant a user in a chat could
                neither see nor change the model. */}
            <ComposerModelControl thread={activeThread.data} />
            {/* The mode switch sits immediately before the mic it changes:
                with it on, the same press-to-talk gesture sends instead of
                drafting, and Eve's finished replies are spoken back. */}
            <VoiceConversationControl
              active={conversationMode}
              onChange={setConversationMode}
            />
            {/* Dictation is opt-in per click — there is no listening mode to
                turn on, so the control is always present and always resting
                until pressed. Voice conversation does NOT make it
                always-listening: it still takes one press per utterance, and
                capture never restarts by itself after a reply is spoken. */}
            <ComposerVoiceControl
              onDraft={handleDictationDraft}
              onSend={handleVoiceSend}
              thread={voiceThread}
              voiceFirst={conversationMode}
            />
            {/* A live call is a different promise from dictation — the agent
                talks back — so it gets its own adjacent control rather than a
                sixth state on the mic. Also explicit per click: no call opens
                without one, and the same button ends it. */}
            <LiveVoiceComposerControl thread={voiceThread} />
          </>
        }
        onAttach={addFiles}
        onAttachUrl={handleAttachUrl}
        onChange={setInput}
        onKeyDown={handleComposerKeyDown}
        onRemoveAttachment={removeAttachment}
        onSend={handleSend}
        onStop={session.stop}
        placeholder={placeholder}
        value={input}
      />
    </div>
  )
}

/** §9.7 — the approval-mode chip, reclaiming the row it used to have alone.
 *  Color means one thing (permission risk): muted for "ask", warning/amber
 *  for "always allow" — echoing Codex's orange "Full access" chip. */
function ApprovalChip({
  mode,
  onChange,
}: {
  mode: ToolApprovalMode
  onChange: (mode: ToolApprovalMode) => void
}) {
  const alwaysAllow = mode === "always"
  return (
    <Select
      onValueChange={(value) => {
        if (value) onChange(value as ToolApprovalMode)
      }}
      value={mode}
    >
      <ToneChip
        aria-label="Tool approval mode"
        render={<SelectTrigger size="sm" />}
        title="Tool approval mode"
        tone={alwaysAllow ? "warning" : "muted"}
      >
        <SelectValue />
      </ToneChip>
      <SelectContent align="start">
        <SelectItem value="ask">Ask</SelectItem>
        <SelectItem value="always">Always allow</SelectItem>
      </SelectContent>
    </Select>
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
