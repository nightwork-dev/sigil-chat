// Route-side data sources for the homes.
//
// Scoped work comes from SC.5's permission-filtered server queries. Live
// artifacts come from the authenticated application artifact manifest. Agent
// Activity and attention project the durable retained session event stream.

import { artifactUrl, type ArtifactRecord } from "@/lib/artifacts"
import type { HomeSignals } from "@/lib/home-signals"
import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"
import type { Story } from "@workspace/work-items-store/types"

import type {
  ActivityItem,
  AgentRow,
  AttentionItem,
  ResourceRow,
  ScopedWorkSource,
  WorkSummaryItem,
} from "./types"

export interface HomeRouteSources {
  readonly work: ScopedWorkSource
  readonly agents: readonly AgentRow[]
  readonly resources: readonly ResourceRow[]
  readonly artifacts: readonly ResourceRow[]
  readonly activity: readonly ActivityItem[]
  readonly attention: readonly AttentionItem[]
}

export interface LiveWorkInput {
  readonly scopeId?: string
  readonly scopeStories?: readonly Story[]
  readonly sessionId?: string
  readonly sessionStories?: readonly Story[]
  readonly nav: ProjectWorkspaceNavSummary
}

export type ArtifactHomeKind = "project" | "workspace" | "session"

export function artifactScopeForHome(
  kind: ArtifactHomeKind,
  id: string,
): string {
  return id.startsWith(`${kind}:`) ? id : `${kind}:${id}`
}

export function artifactRowsFromRecords(
  artifacts: readonly ArtifactRecord[],
  options: {
    readonly mountedFromName?: string
    readonly scope?: string
  } = {},
): ResourceRow[] {
  return [...artifacts]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((artifact) => ({
      id: artifact.id,
      name: artifact.filename,
      kind: "artifact" as const,
      mediaType: artifact.mediaType,
      ...(options.scope
        ? { nativeHref: artifactUrl(artifact.id, options.scope) }
        : {}),
      ...(options.mountedFromName
        ? { mountedFromName: options.mountedFromName }
        : {}),
    }))
}

export function liveWorkSource({
  scopeId,
  scopeStories = [],
  sessionId,
  sessionStories = [],
  nav,
}: LiveWorkInput): ScopedWorkSource {
  const scopeNames = new Map([
    ...nav.projects.map((scope) => [scope.id, scope.name] as const),
    ...nav.workspaces.map((scope) => [scope.id, scope.name] as const),
  ])
  const summarize = (story: Story): WorkSummaryItem => {
    const homeScopeName = story.homeScopeId
      ? scopeNames.get(story.homeScopeId)
      : undefined
    return {
      id: story.id,
      title: story.title,
      status: story.status,
      ...(story.kind ? { kind: story.kind } : {}),
      ...(homeScopeName ? { homeScopeName } : {}),
      updatedAt: story.updatedAt,
      href: `/roadmap?story=${encodeURIComponent(story.id)}`,
    }
  }
  return {
    summariesForScope: (requestedScopeId) =>
      requestedScopeId === scopeId ? scopeStories.map(summarize) : [],
    commitmentsForSession: (requestedSessionId) =>
      requestedSessionId === sessionId ? sessionStories.map(summarize) : [],
  }
}

export function routeSources(
  agents: readonly AgentRow[],
  work: ScopedWorkSource,
  live: {
    readonly resources?: readonly ResourceRow[]
    readonly artifacts?: readonly ResourceRow[]
    readonly signals?: HomeSignals
    readonly viaProjectId?: string
  } = {},
): HomeRouteSources {
  const signals = homeRowsFromSignals(live.signals, agents, live.viaProjectId)
  return {
    work,
    agents,
    resources: live.resources ?? [],
    artifacts: live.artifacts ?? [],
    activity: signals.activity,
    attention: signals.attention,
  }
}

export function homeRowsFromSignals(
  signals: HomeSignals | undefined,
  agents: readonly AgentRow[],
  viaProjectId?: string,
): Pick<HomeRouteSources, "activity" | "attention"> {
  if (!signals) return { activity: [], attention: [] }
  const agentName = (personaId: string) =>
    agents.find((agent) => agent.personaId === personaId)?.name ?? personaId
  const href = (threadId: string) =>
    `/sessions/${threadId}${viaProjectId ? `?via=${encodeURIComponent(viaProjectId)}` : ""}`
  return {
    activity: signals.activity.map((item) => ({
      id: item.id,
      agentName: agentName(item.agentPersonaId),
      summary: item.summary,
      occurredAt: item.occurredAt,
      href: href(item.threadId),
    })),
    attention: signals.attention.map((item) => ({
      id: item.id,
      agentName: agentName(item.agentPersonaId),
      subject: item.body,
      notedFromName: undefined,
      href: href(item.threadId),
    })),
  }
}
