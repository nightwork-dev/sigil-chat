import {
  AGENT_PERSONA_HEADER,
  AGENT_SCOPE_HEADER,
} from "@/lib/agent-session-scope"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  EveAgentStoreSnapshot,
  HandleMessageStreamEvent,
  SessionState,
} from "eve/client"
import type { EveMessageData } from "eve/react"

import { AgentRuntimeSessionProvider } from "@zigil/agent-react/session"
import { AgentThreadControlsProvider } from "@zigil/agent-react/thread-controls"
import type {
  AgentRuntimeSession,
  AgentSendInput,
  AgentThreadControls,
} from "@zigil/agent-surface/contracts"
import {
  addContextAttachment,
  removeTurnContextAttachment,
  setContextDraftScope,
} from "@zigil/agent-react/context-draft"
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
import { agentEventsForReplay } from "@/lib/agent-event-retention"
import {
  AgentSessionPersistenceCoordinator,
  createSingleWriteSessionPersistence,
} from "@/lib/agent-session-persistence"
import { AgentOutcomeProjector } from "@/components/agent/agent-outcome-projector"
import { AgentPersonaSessionProvider } from "@/components/agent/agent-persona-session"
import { getAgentTurnBootstrap } from "@/lib/agent-turn-bootstrap"
import { useEveRuntimeSession } from "@/lib/eve-runtime-session"

export function AppAgentSessions({
  children,
  principalId,
}: {
  children: ReactNode
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
              : "The Gonk-backed session catalog could not be restored."}
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
  principalId,
  selectThread,
  thread,
  threads,
}: {
  children: ReactNode
  createThread: (personaId: string) => Promise<unknown>
  forkThread: () => Promise<unknown>
  principalId: string
  selectThread: (threadId: string) => Promise<unknown>
  thread: AgentThread
  threads: readonly AgentThreadSummary[]
}) {
  const saveSnapshot = useSaveAgentThreadSnapshot()
  const consumeForkSeed = useConsumeAgentThreadForkSeed()
  const renameThread = useRenameAgentThread()
  const eventsRef = useRef<HandleMessageStreamEvent[]>([
    ...agentEventsForReplay(thread.eve.events),
  ])
  const persistence = useRef(
    new AgentSessionPersistenceCoordinator(thread.revision),
  )
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)

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
      session: SessionState,
      events: readonly HandleMessageStreamEvent[] = eventsRef.current,
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

  const handleEvent = useCallback((event: HandleMessageStreamEvent) => {
    eventsRef.current = [...eventsRef.current, event]
  }, [])

  const handleFinish = useCallback(
    (snapshot: EveAgentStoreSnapshot<EveMessageData>) => {
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
    initialEvents: agentEventsForReplay(thread.eve.events),
    initialSession: thread.eve.session,
    onEvent: handleEvent,
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
          const { scopeProof, sessionBindingProof } =
            await getAgentTurnBootstrap({
              principalId,
              threadId: thread.id,
              ...(resourceScope ? { resourceScope } : {}),
            })
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
          <AgentOutcomeProjector session={session} />
          {children}
        </AgentPersonaSessionProvider>
      </AgentRuntimeSessionProvider>
    </AgentThreadControlsProvider>
  )
}

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
