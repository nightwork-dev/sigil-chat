// Route-side data sources for the homes.
//
// Honesty rule: a live page never shows fixture records as if they were
// real — with one sanctioned exception. Scoped work is the brief-approved
// interim: it flows through the ScopedWorkSource seam backed by the typed
// Northstar fixture until SC.5's durable board query replaces it behind the
// same interface. Resources, artifacts, and attention have NO sanctioned
// interim — routes render them empty until the integration lane lands a
// real query, EXCEPT under the explicit, self-documenting `?fixtures=1`
// review flag used by the browser:owner gate to exercise the rich states.

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
} from "./types"

export interface HomeRouteSources {
  readonly work: ScopedWorkSource
  readonly agents: readonly AgentRow[]
  readonly resources: readonly ResourceRow[]
  readonly artifacts: readonly ResourceRow[]
  readonly attention: readonly AttentionItem[]
}

export function routeSources(
  fixtures: boolean,
  agents: readonly AgentRow[],
): HomeRouteSources {
  if (!fixtures) {
    return {
      work: fixtureWorkSource, // sanctioned interim — see header
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
