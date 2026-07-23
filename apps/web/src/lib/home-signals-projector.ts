import type { AgentThread } from "./agent-threads-domain"
import type {
  PersistedAgentEvent,
  RetainedJsonValue,
} from "./agent-event-retention"
import type { ProjectWorkspaceNav } from "./agent-thread-containers.server"
import type {
  HomeActivityRecord,
  HomeAttentionRecord,
  HomeSignalScopeKind,
  HomeSignals,
} from "./home-signals"

const MAX_ACTIVITY = 12
const MAX_ATTENTION = 12
const ANNOTATION_TOOLS = ["sigil-annotate", "sigil-pin", "sigil-highlight"]

export interface HomeSignalProjectionInput {
  readonly home: { readonly id: string; readonly kind: HomeSignalScopeKind }
  readonly nav: ProjectWorkspaceNav
  readonly threads: readonly AgentThread[]
}

export function projectHomeSignals(
  input: HomeSignalProjectionInput,
): HomeSignals {
  const threads = input.threads.filter((thread) =>
    threadBelongsToHome(thread, input),
  )
  const activity: HomeActivityRecord[] = []
  const attention: HomeAttentionRecord[] = []
  for (const thread of threads) {
    thread.runtime.events.forEach((event) => {
      const occurredAt = event.meta?.at ?? thread.updatedAt
      const activityRecord = activityFromEvent(thread, event, occurredAt)
      if (activityRecord) activity.push(activityRecord)
      const attentionRecord = attentionFromEvent(thread, event, occurredAt)
      if (attentionRecord) attention.push(attentionRecord)
    })
  }
  return {
    activity: newestFirst(activity).slice(0, MAX_ACTIVITY),
    attention: newestFirst(attention).slice(0, MAX_ATTENTION),
  }
}

function threadBelongsToHome(
  thread: AgentThread,
  input: HomeSignalProjectionInput,
): boolean {
  if (input.home.kind === "session") return thread.id === input.home.id
  const homeScopeId = thread.executionBinding?.homeScopeId
  if (!homeScopeId) return false
  if (input.home.kind === "workspace") return homeScopeId === input.home.id
  if (homeScopeId === input.home.id) return true
  if (
    homeScopeId === `personal-scope:${thread.executionBinding?.principalId}`
  ) {
    return input.home.id === input.nav.personalProjectId
  }
  const workspace = input.nav.workspaces.find(({ id }) => id === homeScopeId)
  return Boolean(
    workspace &&
    ((workspace.homeScopeId ?? workspace.projectId) === input.home.id ||
      workspace.mountedProjectIds.includes(input.home.id)),
  )
}

function activityFromEvent(
  thread: AgentThread,
  event: PersistedAgentEvent,
  occurredAt: string,
): HomeActivityRecord | undefined {
  if (
    event.type === "action.result" &&
    event.data.result.kind === "tool-result"
  ) {
    const toolName = bareToolName(event.data.result.toolName)
    if (isAnnotationTool(toolName)) return undefined
    return {
      id: `${thread.id}:${event.data.result.callId}:${event.data.status}`,
      agentPersonaId: thread.personaId,
      occurredAt,
      summary:
        event.data.status === "completed"
          ? `Used ${humanizeToolName(toolName)}`
          : `${humanizeToolName(toolName)} ${event.data.status}`,
      threadId: thread.id,
    }
  }
  if (event.type !== "message.completed" || !event.data.message)
    return undefined
  return {
    id: `${thread.id}:${event.data.turnId}:message:${event.data.stepIndex}`,
    agentPersonaId: thread.personaId,
    occurredAt,
    summary: `Replied in ${thread.title}`,
    threadId: thread.id,
  }
}

function attentionFromEvent(
  thread: AgentThread,
  event: PersistedAgentEvent,
  occurredAt: string,
): HomeAttentionRecord | undefined {
  if (
    event.type !== "action.result" ||
    event.data.status !== "completed" ||
    event.data.result.kind !== "tool-result" ||
    !isAnnotationTool(bareToolName(event.data.result.toolName))
  ) {
    return undefined
  }
  const annotation = readAnnotationOutput(event.data.result.output)
  if (!annotation) return undefined
  return {
    id: `${thread.id}:${event.data.result.callId}`,
    agentPersonaId: thread.personaId,
    anchorId: annotation.anchorId,
    body: annotation.body,
    label: annotation.label,
    occurredAt,
    threadId: thread.id,
  }
}

function readAnnotationOutput(value: RetainedJsonValue):
  | {
      anchorId: string
      body: string
      label: string
    }
  | undefined {
  const candidates = [
    value,
    recordValue(value, "data"),
    recordValue(value, "structuredContent"),
    recordValue(recordValue(value, "structuredContent"), "data"),
  ]
  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      typeof candidate.anchorId === "string" &&
      typeof candidate.body === "string" &&
      typeof candidate.label === "string"
    ) {
      return {
        anchorId: candidate.anchorId,
        body: candidate.body,
        label: candidate.label,
      }
    }
  }
  return undefined
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function bareToolName(value: string): string {
  const separator = value.lastIndexOf("__")
  return separator >= 0 ? value.slice(separator + 2) : value
}

function isAnnotationTool(value: string): boolean {
  return ANNOTATION_TOOLS.includes(value)
}

function humanizeToolName(value: string): string {
  return value
    .replace(/^sigil-/, "")
    .replaceAll("-", " ")
    .replaceAll(".", " ")
}

function newestFirst<T extends { id: string; occurredAt: string }>(
  values: T[],
): T[] {
  return values.sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      right.id.localeCompare(left.id),
  )
}
