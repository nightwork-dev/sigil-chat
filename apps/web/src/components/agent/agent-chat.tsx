import {
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { AlertTriangleIcon, WrenchIcon } from "lucide-react"

import {
  isAgentSessionBusy,
  type AgentRuntimeSession,
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
import { DEPLOYMENT_DEFAULT_PRESET_ID } from "@workspace/runtime-env/constants"
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
import { ComposerVoiceControl } from "@/components/agent/voice-composer-control"
import { LiveVoiceComposerControl } from "@/components/agent/live-voice-composer-control"
import { VoiceConversationControl } from "@/components/agent/voice-conversation-control"
import { useWorkspaceResourceScope } from "@/components/agent/workspace-attention"
import { useActiveThreadContainers } from "@/hooks/use-active-thread-containers"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { useAgentRuntimeCatalog } from "@/lib/agent-catalog"
import {
  useAgentThread,
  useSetAgentThreadRequestOptions,
  type AgentThread,
  type AgentThreadRequestOptions,
} from "@/lib/agent-threads"
import { useModelEndpoints } from "@/lib/model-endpoints"
import { useUploadAgentAttachment } from "@/lib/agent-attachments"
import { appendDictationDraft } from "@/lib/voice-dictation"
import { useSpeakReplies } from "@/lib/agent-speak-replies"
import { useSpokenAgentReplies } from "@/lib/spoken-replies"
import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"
import type { BoundAgentModel } from "@workspace/agent-contracts/model-binding"
import type { VoiceBoundThread } from "@/lib/voice-session-binding"
import type { WorkspaceResourceCandidate } from "@/lib/add-sources"
import {
  AGENT_SCOPE_HEADER,
  sessionResourceScope,
} from "@/lib/agent-session-scope"
import type { ToolApprovalMode } from "@/lib/agent-tool-approval"
import { isAtWordBoundary } from "@/lib/mention-trigger"

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
            {hideHeader ? (
              <ModelLabel bound={activeThread.data?.executionBinding?.model} />
            ) : null}
            {hideHeader && activeThread.data ? (
              <ReasoningControls thread={activeThread.data} />
            ) : null}
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

/** §9.7 — the model this thread actually runs. The thread's immutable bound
 *  model wins; the runtime catalog's deployment default is only the fallback
 *  for threads that made no selection. A deployment-global label here would
 *  misreport every non-default session (it did, before per-session binding). */
function ModelLabel({ bound }: { bound?: BoundAgentModel }) {
  const catalog = useAgentRuntimeCatalog()
  const name = catalog.data?.agent.name ?? "Eve"
  const model = bound
    ? `${bound.provider}/${bound.modelId}`
    : catalog.data?.agent.model
  return (
    <span className="hidden shrink-0 truncate px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
      {name}
      {model ? ` · ${model}` : ""}
    </span>
  )
}

/**
 * MDL.4 — reasoning level and fast mode, seated beside the model label they
 * describe. Renders nothing when the bound model declares neither control
 * (AC2/AC3): a model with no `reasoning`/`fastMode` fixture declaration is
 * indistinguishable from one this component has never heard of.
 *
 * Reads `thread.requestOptions` — never local state — so what is shown is
 * always the last value the server persisted, i.e. what the NEXT turn will
 * actually run with. `useSetAgentThreadRequestOptions`'s `onSuccess` caches
 * the server's returned thread, so a change round-trips through the same
 * "resolved, not optimistic" path the model label already uses.
 */
function ReasoningControls({ thread }: { thread: AgentThread }) {
  const endpoints = useModelEndpoints()
  const setRequestOptions = useSetAgentThreadRequestOptions()
  const presetId =
    thread.executionBinding?.model?.presetId ?? DEPLOYMENT_DEFAULT_PRESET_ID
  const record = endpoints.data?.providers
    .flatMap((provider) => provider.models)
    .find((model) => model.id === presetId)
  if (!record || (!record.reasoning && !record.fastMode)) return null

  const current = thread.requestOptions
  function apply(next: AgentThreadRequestOptions) {
    setRequestOptions.mutate({
      id: thread.id,
      requestOptions: { ...current, ...next },
      expectedRevision: thread.revision,
    })
  }

  return (
    <>
      {record.reasoning ? (
        <Select
          disabled={setRequestOptions.isPending}
          onValueChange={(value) => {
            if (value) apply({ reasoningLevel: value })
          }}
          value={current?.reasoningLevel ?? record.reasoning.default}
        >
          <ToneChip
            aria-label="Reasoning level"
            render={<SelectTrigger size="sm" />}
            title="Reasoning level"
          >
            <SelectValue />
          </ToneChip>
          <SelectContent align="start">
            {record.reasoning.levels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {record.fastMode ? (
        <ToneChip
          aria-label="Fast mode"
          aria-pressed={current?.fastMode === true}
          disabled={setRequestOptions.isPending}
          onClick={() => apply({ fastMode: !current?.fastMode })}
          title="Fast mode"
          tone={current?.fastMode === true ? "info" : "muted"}
        >
          Fast
        </ToneChip>
      ) : null}
    </>
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
