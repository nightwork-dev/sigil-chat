import {
  AGENT_PERSONA_HEADER,
  AGENT_SCOPE_HEADER,
} from "@/lib/agent-session-scope"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import type { AgentParticipantEnvelopeSubject } from "@workspace/agent-contracts/participant-channel"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AgentRuntimeSessionProvider,
  AgentThreadControlsProvider,
  addContextAttachment,
  removeTurnContextAttachment,
  setContextDraftScope,
} from "@zigil/agent/react"
import {
  useEveRuntimeSession,
  type UseEveRuntimeSessionOptions,
} from "@zigil/agent/react/eve"
import type {
  AgentRuntimeSession,
  AgentSendInput,
  AgentThreadControls,
} from "@zigil/agent/contracts"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  useActiveAgentThreadPreference,
  useAgentThread,
  useAgentThreads,
  useConsumeAgentThreadForkSeed,
  useCreateAgentThread,
  useForkAgentThread,
  useRenameAgentThread,
  useSaveAgentThreadSnapshot,
  useSetActiveAgentThread,
  type AgentThread,
  type AgentThreadForkSeed,
  type AgentThreadSummary,
} from "@/lib/agent-threads"
import { getEveBearerToken } from "@/lib/auth/client"
import {
  AGENT_EVENT_RETENTION_POLICY,
  agentEventsForReplay,
  type AgentRuntimeStreamEvent,
} from "@/lib/agent-event-retention"
import {
  AgentSessionPersistenceCoordinator,
  createSingleWriteSessionPersistence,
} from "@/lib/agent-session-persistence"
import { AgentOutcomeProjector } from "@/components/agent/agent-outcome-projector"
import { AgentPersonaSessionProvider } from "@/components/agent/agent-persona-session"
import { getAgentScopeProof } from "@/lib/agent-scope-delegation"
import { getAgentSessionBindingProof } from "@/lib/agent-session-binding"
import {
  AgentParticipantChannelProvider,
  normalizeParticipantThreadIds,
  participantIdForThread,
  useAgentParticipantChannel,
  useParticipantSessionAdapter,
  type AgentParticipantChannelConfig,
  type AgentParticipantSessionAdapter,
} from "@/lib/agent-participant-channel"

export function AppAgentSessions({
  children,
  participantChannel,
  principalId,
}: {
  children: ReactNode
  participantChannel?: AgentParticipantChannelConfig
  principalId: string
}) {
  const threadsQuery = useAgentThreads()
  const preferenceQuery = useActiveAgentThreadPreference()
  const createThread = useCreateAgentThread()
  const forkThread = useForkAgentThread()
  const setActiveThread = useSetActiveAgentThread()
  const threads = threadsQuery.data ?? []
  const preferredId = preferenceQuery.data?.activeThreadId
  const activeSummary =
    threads.find((thread) => thread.id === preferredId) ?? threads[0]
  const activeThreadQuery = useAgentThread(activeSummary?.id)

  if (
    threadsQuery.isPending ||
    preferenceQuery.isPending ||
    (activeSummary && activeThreadQuery.isPending)
  ) {
    return (
      <div className="grid min-h-svh place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Restoring agent sessions…
        </div>
      </div>
    )
  }

  if (
    threadsQuery.isError ||
    preferenceQuery.isError ||
    activeThreadQuery.isError
  ) {
    const error =
      threadsQuery.error ?? preferenceQuery.error ?? activeThreadQuery.error
    return (
      <div className="mx-auto grid min-h-svh max-w-xl place-items-center p-6">
        <Alert variant="destructive">
          <AlertTitle>Agent sessions unavailable</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "The agent session catalog could not be restored."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const activeThread = activeThreadQuery.data

  if (!activeThread) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Alert className="max-w-md" variant="destructive">
          <AlertTitle>No active agent session</AlertTitle>
          <AlertDescription>
            The session repository returned no active thread.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <ActiveAgentSession
      createThread={(personaId) => createThread.mutateAsync({ personaId })}
      forkThread={() =>
        forkThread.mutateAsync({ sourceThreadId: activeThread.id })
      }
      key={activeThread.id}
      participantChannel={participantChannel}
      principalId={principalId}
      selectThread={(threadId) => setActiveThread.mutateAsync({ id: threadId })}
      thread={activeThread}
      threads={threads}
    >
      {children}
    </ActiveAgentSession>
  )
}

function ActiveAgentSession({
  children,
  createThread,
  forkThread,
  participantChannel,
  principalId,
  selectThread,
  thread,
  threads,
}: {
  children: ReactNode
  createThread: (personaId: string) => Promise<unknown>
  forkThread: () => Promise<unknown>
  participantChannel?: AgentParticipantChannelConfig
  principalId: string
  selectThread: (threadId: string) => Promise<unknown>
  thread: AgentThread
  threads: readonly AgentThreadSummary[]
}) {
  const saveSnapshot = useSaveAgentThreadSnapshot()
  const consumeForkSeed = useConsumeAgentThreadForkSeed()
  const renameThread = useRenameAgentThread()
  const eventsRef = useRef<AgentRuntimeStreamEvent[]>([
    ...agentEventsForReplay(thread.runtime.events),
  ])
  const persistence = useRef(
    new AgentSessionPersistenceCoordinator(thread.revision),
  )
  persistence.current.observeRevision(thread.revision)
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)
  const [participantAdapters, setParticipantAdapters] = useState<
    readonly AgentParticipantSessionAdapter[]
  >([])
  const participantThreadIdsKey = normalizedParticipantThreadIdsKey(
    participantChannel?.threadIds ?? [],
  )
  const participantThreadIds = useMemo(
    () =>
      participantThreadIdsKey ? participantThreadIdsKey.split("\u0000") : [],
    [participantThreadIdsKey],
  )
  const registerParticipantAdapter = useCallback(
    (adapter: AgentParticipantSessionAdapter) => {
      setParticipantAdapters((current) => [
        ...current.filter((entry) => entry.threadId !== adapter.threadId),
        adapter,
      ])
      return () =>
        setParticipantAdapters((current) =>
          current.filter((entry) => entry.threadId !== adapter.threadId),
        )
    },
    [],
  )

  useLayoutEffect(() => {
    setContextDraftScope(thread.id)
    if (!thread.forkSeed) return
    const attachmentId = semanticForkAttachmentId(thread.forkSeed)
    addContextAttachment({
      id: attachmentId,
      source: "semantic-fork",
      inclusion: "automatic",
      resource: {
        kind: "agent-thread",
        id: thread.forkSeed.sourceThreadId,
      },
      label: `Fork of ${thread.forkSeed.sourceThreadId}`,
      summary: `Source revision ${thread.forkSeed.sourceRevision}; full visible transcript is supplied by the application runtime.`,
      retention: "session",
    })
    return () => removeTurnContextAttachment(attachmentId)
  }, [thread.forkSeed, thread.id])

  const persistSnapshot = useCallback(
    (
      session: AgentThread["runtime"]["session"],
      events: readonly AgentRuntimeStreamEvent[] = eventsRef.current,
    ) => {
      const operation = persistence.current.persist((expectedRevision) =>
        saveSnapshot.mutateAsync({
          id: thread.id,
          snapshot: { events: [...events], session },
          expectedRevision,
        }),
      )
      void operation.then(
        () => setPersistenceError(null),
        (error) =>
          setPersistenceError(
            error instanceof Error
              ? error
              : new Error("Failed to persist agent session snapshot."),
          ),
      )
      return operation
    },
    [saveSnapshot, thread.id],
  )

  const handleEvent = useCallback((event: AgentRuntimeStreamEvent) => {
    eventsRef.current = [...eventsRef.current, event]
  }, [])

  const handleFinish = useCallback(
    (snapshot: AgentAdapterSnapshot) => {
      eventsRef.current = [...snapshot.events]
      persistSnapshot(snapshot.session, snapshot.events)
    },
    [persistSnapshot],
  )
  const persistenceCallbacks = useMemo(
    () => createSingleWriteSessionPersistence(handleFinish),
    [handleFinish],
  )

  const handleSendSuccess = useCallback(
    async (input: AgentSendInput) => {
      const message =
        typeof input.message === "string" ? input.message : undefined
      try {
        await persistence.current.afterPersisted(() => Promise.resolve())
      } catch {
        return
      }
      if (thread.forkSeed && message !== undefined) {
        await persistence.current.persist((expectedRevision) =>
          consumeForkSeed.mutateAsync({ id: thread.id, expectedRevision }),
        )
      }
      if (thread.title === "New conversation" && message !== undefined) {
        await persistence.current.persist((expectedRevision) =>
          renameThread.mutateAsync({
            id: thread.id,
            title: deriveThreadTitle(message),
            expectedRevision,
          }),
        )
      }
    },
    [consumeForkSeed, renameThread, thread.forkSeed, thread.id, thread.title],
  )

  const controls = useMemo<AgentThreadControls>(
    () => ({
      activeThreadId: thread.id,
      threads: threads.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        updatedAt: candidate.updatedAt,
        ...(candidate.forkedFrom
          ? { forkedFromThreadId: candidate.forkedFrom }
          : {}),
      })),
      createThread: async () => {
        await persistence.current.afterPersisted(() =>
          createThread(thread.personaId),
        )
      },
      forkActiveThread: async () => {
        await persistence.current.afterPersisted(forkThread)
      },
      selectThread: async (threadId) => {
        await persistence.current.afterPersisted(() => selectThread(threadId))
      },
    }),
    [
      createThread,
      forkThread,
      selectThread,
      thread.id,
      thread.personaId,
      threads,
    ],
  )

  const eveSession = useEveRuntimeSession({
    ...persistenceCallbacks,
    auth: { bearer: getEveBearerToken },
    initialEvents: agentEventsForReplay(thread.runtime.events),
    initialSession: thread.runtime.session,
    onEvent: handleEvent,
  })
  const activeParticipantAdapter = useParticipantSessionAdapter({
    participantThreadIds,
    principalId,
    session: eveSession,
    thread,
  })
  const turnActive = useRef(false)
  const session = useMemo<AgentRuntimeSession>(
    () => ({
      ...eveSession,
      send: async (input) => {
        if (turnActive.current) {
          return {
            status: "failed",
            error: {
              message: "The agent session is already processing a turn.",
            },
          }
        }
        turnActive.current = true
        try {
          const resourceScope = input.headers?.[AGENT_SCOPE_HEADER]
          const [scopeProof, sessionBindingProof] = await Promise.all([
            resourceScope
              ? getAgentScopeProof(resourceScope, principalId)
              : Promise.resolve(undefined),
            getAgentSessionBindingProof(thread.id, principalId),
          ])
          const result = await eveSession.send({
            ...input,
            headers: {
              ...input.headers,
              [AGENT_PERSONA_HEADER]: thread.personaId,
              [AGENT_SESSION_BINDING_HEADER]: sessionBindingProof,
              ...(scopeProof ? { [AGENT_SCOPE_PROOF_HEADER]: scopeProof } : {}),
            },
            clientContext: composeClientContext(
              input.clientContext,
              thread.forkSeed,
            ),
          })
          if (result.status === "succeeded") await handleSendSuccess(input)
          return result
        } finally {
          turnActive.current = false
        }
      },
    }),
    [
      eveSession,
      handleSendSuccess,
      principalId,
      thread.forkSeed,
      thread.id,
      thread.personaId,
    ],
  )
  const activeThreadIsParticipant = participantThreadIds.includes(thread.id)
  const channelAdapters = useMemo(
    () =>
      activeThreadIsParticipant
        ? [
            activeParticipantAdapter,
            ...participantAdapters.filter(
              (adapter) => adapter.threadId !== thread.id,
            ),
          ]
        : participantAdapters,
    [
      activeParticipantAdapter,
      activeThreadIsParticipant,
      participantAdapters,
      thread.id,
    ],
  )
  const mountedParticipantThreadIds = useMemo(
    () =>
      participantThreadIds.filter(
        (participantThreadId) => participantThreadId !== thread.id,
      ),
    [participantThreadIds, thread.id],
  )

  return (
    <AgentThreadControlsProvider value={controls}>
      {persistenceError ? (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
          <Alert variant="destructive">
            <AlertTitle>Agent session was not saved</AlertTitle>
            <AlertDescription>{persistenceError.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <AgentRuntimeSessionProvider session={session}>
        <AgentPersonaSessionProvider personaId={thread.personaId}>
          <AgentParticipantChannelProvider
            adapters={channelAdapters}
            config={participantChannel}
            principalId={principalId}
          >
            {mountedParticipantThreadIds.map((threadId) => (
              <ParticipantAgentSessionMount
                key={threadId}
                participantThreadIds={participantThreadIds}
                principalId={principalId}
                register={registerParticipantAdapter}
                threadId={threadId}
              />
            ))}
            <AgentOutcomeProjector session={session} />
            {children}
          </AgentParticipantChannelProvider>
        </AgentPersonaSessionProvider>
      </AgentRuntimeSessionProvider>
    </AgentThreadControlsProvider>
  )
}

function ParticipantAgentSessionMount({
  participantThreadIds,
  principalId,
  register,
  threadId,
}: {
  participantThreadIds: readonly string[]
  principalId: string
  register: (adapter: AgentParticipantSessionAdapter) => () => void
  threadId: string
}) {
  const threadQuery = useAgentThread(threadId)
  const saveSnapshot = useSaveAgentThreadSnapshot()
  const eventsRef = useRef<AgentRuntimeStreamEvent[]>([])
  const persistence = useRef<AgentSessionPersistenceCoordinator | null>(null)
  const thread = threadQuery.data
  const participantChannel = useAgentParticipantChannel()
  const participantId = participantIdForThread(threadId)
  const recordedContextReceiptIds = useRef(new Set<string>())
  const recordedMessagePartIds = useRef(new Set<string>())

  useEffect(() => {
    if (!thread) return
    eventsRef.current = [...agentEventsForReplay(thread.runtime.events)]
    persistence.current = new AgentSessionPersistenceCoordinator(
      thread.revision,
    )
  }, [thread])

  const persistSnapshot = useCallback(
    (
      session: AgentThread["runtime"]["session"],
      events: readonly AgentRuntimeStreamEvent[] = eventsRef.current,
    ) => {
      if (!thread || !persistence.current) return Promise.resolve()
      return persistence.current.persist((expectedRevision) =>
        saveSnapshot.mutateAsync({
          id: thread.id,
          snapshot: { events: [...events], session },
          expectedRevision,
        }),
      )
    },
    [saveSnapshot, thread],
  )

  const handleEvent = useCallback(
    (event: AgentRuntimeStreamEvent) => {
      eventsRef.current = [...eventsRef.current, event]
      for (const envelope of participantEnvelopesForRuntimeEvent(event)) {
        participantChannel?.record({
          targetParticipantId: participantId,
          ...envelope,
        })
      }
    },
    [participantChannel, participantId],
  )

  const handleFinish = useCallback(
    (snapshot: AgentAdapterSnapshot) => {
      eventsRef.current = [...snapshot.events]
      void persistSnapshot(snapshot.session, snapshot.events)
    },
    [persistSnapshot],
  )
  const persistenceCallbacks = useMemo(
    () => createSingleWriteSessionPersistence(handleFinish),
    [handleFinish],
  )

  const eveSession = useEveRuntimeSession({
    ...persistenceCallbacks,
    auth: { bearer: getEveBearerToken },
    initialEvents: thread ? agentEventsForReplay(thread.runtime.events) : [],
    initialSession: thread?.runtime.session,
    onEvent: handleEvent,
  })
  const adapter = useParticipantSessionAdapter({
    participantThreadIds,
    principalId,
    session: eveSession,
    thread: thread ?? emptyParticipantThread(threadId, principalId),
  })
  const registeredAdapter = useMemo(
    () => (thread ? adapter : undefined),
    [adapter, thread],
  )

  useEffect(() => {
    if (!registeredAdapter) return
    return register(registeredAdapter)
  }, [register, registeredAdapter])

  useEffect(() => {
    if (!participantChannel || !thread?.contextReceipts) return
    for (const receipt of thread.contextReceipts) {
      if (recordedContextReceiptIds.current.has(receipt.recordId)) continue
      recordedContextReceiptIds.current.add(receipt.recordId)
      participantChannel.record({
        payload: receipt,
        subject: "context-contribution",
        targetParticipantId: participantId,
        ...(receipt.turnId ? { turnId: receipt.turnId } : {}),
      })
    }
  }, [participantChannel, participantId, thread?.contextReceipts])

  useEffect(() => {
    if (!participantChannel) return
    eveSession.data.messages.forEach((message, messageIndex) => {
      const record = message as {
        readonly id?: string
        readonly parts?: readonly unknown[]
      }
      const messageId = record.id ?? `message:${messageIndex}`
      for (const [partIndex, part] of (record.parts ?? []).entries()) {
        if (!part || typeof part !== "object") continue
        const partRecord = part as Record<string, unknown>
        const partId =
          typeof partRecord.id === "string"
            ? partRecord.id
            : `${messageId}:part:${partIndex}`
        if (recordedMessagePartIds.current.has(partId)) continue
        const outcome = domainOutcomeFromToolPart(partRecord)
        if (!outcome) continue
        recordedMessagePartIds.current.add(partId)
        participantChannel.record({
          payload: outcome,
          subject: "domain-outcome",
          targetParticipantId: participantId,
        })
      }
    })
  }, [eveSession.data.messages, participantChannel, participantId])

  return null
}

type ParticipantEnvelopeDraft = {
  readonly payload: unknown
  readonly streamId?: string
  readonly subject: AgentParticipantEnvelopeSubject
  readonly turnId?: string
}

function participantEnvelopesForRuntimeEvent(
  event: AgentRuntimeStreamEvent,
): readonly ParticipantEnvelopeDraft[] {
  switch (event.type) {
    case "message.received":
    case "message.completed":
      return [
        {
          payload: event,
          subject: "message",
          turnId: event.data.turnId,
        },
      ]
    case "actions.requested":
      return event.data.actions.flatMap((action) =>
        action.kind === "tool-call"
          ? [
              {
                payload: action,
                subject: "tool-call" as const,
                turnId: event.data.turnId,
              },
            ]
          : [],
      )
    case "input.requested":
      return event.data.requests.map((request) => ({
        payload: request.action,
        subject: "tool-call" as const,
        turnId: event.data.turnId,
      }))
    case "action.result":
      return [
        {
          payload: event.data.result,
          subject: "tool-result",
          turnId: event.data.turnId,
        },
        ...domainOutcomesFromValue(event.data.result.output).map((outcome) => ({
          payload: outcome,
          subject: "domain-outcome" as const,
          turnId: event.data.turnId,
        })),
      ]
    default:
      return []
  }
}

function domainOutcomeFromToolPart(part: Record<string, unknown>): unknown {
  if (part.type !== "tool-call" || part.state !== "output-available") {
    return null
  }
  return domainOutcomesFromValue(part.output)[0] ?? null
}

function domainOutcomesFromValue(value: unknown): readonly unknown[] {
  const command = commandLike(value)
  if (command?.type === "agent.domain.outcome") return [command]
  return []
}

function commandLike(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.type === "string") return record
  for (const key of ["data", "structuredContent"]) {
    const nested = record[key]
    if (nested && typeof nested === "object") {
      const nestedRecord = nested as Record<string, unknown>
      if (typeof nestedRecord.type === "string") return nestedRecord
      const clientCommand = nestedRecord.clientCommand
      if (clientCommand && typeof clientCommand === "object") {
        return clientCommand as Record<string, unknown>
      }
    }
  }
  const clientCommand = record.clientCommand
  return clientCommand && typeof clientCommand === "object"
    ? (clientCommand as Record<string, unknown>)
    : null
}

function normalizedParticipantThreadIdsKey(
  threadIds: readonly string[],
): string {
  return normalizeParticipantThreadIds(threadIds).join("\u0000")
}

type AgentAdapterSnapshot = Parameters<
  NonNullable<UseEveRuntimeSessionOptions["onFinish"]>
>[0]

function formatForkSeed(seed: AgentThreadForkSeed): string {
  const transcript = seed.messages
    .map(
      (message) =>
        `### ${message.role === "user" ? "User" : "Assistant"}\n${message.text}`,
    )
    .join("\n\n")
  return [
    "# Forked conversation context",
    "",
    `This is a semantic fork of thread ${seed.sourceThreadId} at source revision ${seed.sourceRevision}.`,
    "Treat the transcript below as prior context for this new conversation. Do not claim this is an exact clone of hidden reasoning or tool state.",
    "",
    transcript ||
      "_The source thread had no persisted conversational messages._",
  ].join("\n")
}

function semanticForkAttachmentId(seed: AgentThreadForkSeed): string {
  return `semantic-fork:${seed.sourceThreadId}:${seed.sourceRevision}`
}

function composeClientContext(
  clientContext: string | undefined,
  forkSeed: AgentThreadForkSeed | undefined,
): string | undefined {
  const sections = [
    clientContext,
    forkSeed ? formatForkSeed(forkSeed) : undefined,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
  return sections || undefined
}

function deriveThreadTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim()
  if (!normalized) return "New conversation"
  return normalized.length <= 56 ? normalized : `${normalized.slice(0, 55)}…`
}

function emptyParticipantThread(
  threadId: string,
  principalId: string,
): AgentThread {
  const now = new Date(0).toISOString()
  return {
    members: [principalId],
    id: threadId,
    slug: threadId,
    personaId: "pending-participant",
    title: "Pending participant",
    createdAt: now,
    updatedAt: now,
    status: "active",
    revision: 0,
    runtime: {
      schemaVersion: 1,
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        policyVersion: AGENT_EVENT_RETENTION_POLICY,
        firstRetainedStreamIndex: 0,
        omittedEventCount: 0,
        compactedAt: now,
      },
    },
  }
}
