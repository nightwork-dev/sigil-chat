// Route-side data sources for the homes.
//
// Honesty rule: a live page never shows fixture records as if they were real.
// Scoped work comes from SC.5's permission-filtered server queries. Resources,
// artifacts, and attention render empty until their real query lanes land.
// The explicit `?fixtures=1` review flag is the only path that enables the
// Northstar data needed to exercise the rich state matrix.

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"
import type { Story } from "@workspace/work-items-store/types"

import {
  fixtureAgents,
  fixtureArtifactRows,
  fixtureAttention,
  fixtureResources,
  fixtureWorkSource,
} from "./fixtures"
import type {
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
  readonly attention: readonly AttentionItem[]
}

export interface LiveWorkInput {
  readonly scopeId?: string
  readonly scopeStories?: readonly Story[]
  readonly sessionId?: string
  readonly sessionStories?: readonly Story[]
  readonly nav: ProjectWorkspaceNavSummary
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
  fixtures: boolean,
  agents: readonly AgentRow[],
  work: ScopedWorkSource,
): HomeRouteSources {
  if (!fixtures) {
    return {
      work,
      agents,
      resources: [],
      artifacts: [],
      attention: [],
    }
  }
  return {
    work: fixtureWorkSource,
    agents: agents.length > 0 ? agents : fixtureAgents,
    resources: fixtureResources,
    artifacts: fixtureArtifactRows,
    attention: fixtureAttention,
  }
}
