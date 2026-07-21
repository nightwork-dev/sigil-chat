// Typed fixtures for the homes presentation layer — the spec §2 "Northstar"
// model rendered as view-model data. TWO purposes:
//
// 1. Component tests and stories exercise every state (normal, shared-via,
//    empty, denied, archived, attention) against stable data.
// 2. `fixtureWorkSource` implements the ScopedWorkSource seam so homes render
//    scoped-work summaries today; SC.5 replaces it with the durable board
//    query adapter WITHOUT touching components.
//
// Fixtures are presentation data. They carry no authority semantics and are
// never read by server code.

import type {
  ActivityItem,
  AgentRow,
  AttentionItem,
  ProjectHomeView,
  ResourceRow,
  ScopedWorkSource,
  WorkspaceHomeView,
  WorkSummaryItem,
} from "./types"
import type { AgentThreadSummary } from "@/lib/agent-threads"
import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

export const NORTHSTAR = {
  installation: "installation:northstar",
  organization: "org:northstar",
  commerce: "project:commerce-platform",
  brand: "project:brand",
  checkoutReliability: "workspace:checkout-reliability",
  holidayLaunch: "workspace:holiday-launch",
  draftOffers: "session:draft-holiday-offers",
} as const

export const fixtureNav: ProjectWorkspaceNavSummary = {
  personalProjectId: "project:personal-reviewer",
  projects: [
    {
      id: NORTHSTAR.commerce,
      name: "Commerce Platform",
      description: "Storefront and checkout.",
      icon: "🛒",
    },
    {
      id: NORTHSTAR.brand,
      name: "Brand",
      description: "Brand systems and campaigns.",
      icon: "✦",
    },
  ],
  workspaces: [
    {
      id: NORTHSTAR.checkoutReliability,
      projectId: NORTHSTAR.commerce,
      mountedProjectIds: [],
      name: "Checkout Reliability",
      description: "Error budget and payment reliability work.",
      icon: "🧯",
      status: "active",
    },
    {
      id: NORTHSTAR.holidayLaunch,
      projectId: NORTHSTAR.brand,
      mountedProjectIds: [NORTHSTAR.commerce],
      name: "Holiday Launch",
      description: "Holiday campaign offers and storefront coordination.",
      icon: "🎁",
      status: "active",
    },
  ],
}

export const fixtureThreads: readonly AgentThreadSummary[] = [
  {
    id: "session:checkout-triage",
    personaId: "vesper",
    title: "Retry storm triage",
    createdAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-21T10:00:00Z",
    status: "active",
    revision: 2,
    workspaceId: NORTHSTAR.checkoutReliability,
  },
  {
    id: NORTHSTAR.draftOffers,
    personaId: "neve",
    title: "Draft Holiday Offers",
    createdAt: "2026-07-20T09:00:00Z",
    updatedAt: "2026-07-21T09:00:00Z",
    status: "active",
    revision: 3,
    workspaceId: NORTHSTAR.holidayLaunch,
  },
]

const commerceWork: readonly WorkSummaryItem[] = [
  {
    id: "CP.14",
    title: "Split payment capture from authorization",
    status: "in-progress",
    kind: "story",
    updatedAt: "2026-07-20T18:04:00Z",
  },
  {
    id: "CP.15",
    title: "Checkout error budget alerts",
    status: "ready",
    kind: "task",
    updatedAt: "2026-07-19T09:31:00Z",
  },
  {
    id: "CP.9",
    title: "Idempotent order submission",
    status: "verify",
    kind: "story",
    updatedAt: "2026-07-18T14:12:00Z",
  },
]

const holidayWork: readonly WorkSummaryItem[] = [
  {
    id: "HL.3",
    title: "Draft holiday offer catalog",
    status: "in-progress",
    kind: "story",
    updatedAt: "2026-07-21T08:44:00Z",
  },
  {
    id: "HL.4",
    title: "Offer eligibility rules spike",
    status: "idea",
    kind: "feature-request",
    updatedAt: "2026-07-21T07:02:00Z",
  },
]

/** Rollup projection for the Commerce board: Holiday Launch work appears via
 *  its rolls-up-to binding, labelled with its canonical home. One record, one
 *  cell — the board de-duplicates by id before grouping (spec §9.2). */
const commerceRollupWork: readonly WorkSummaryItem[] = [
  ...commerceWork,
  {
    id: "HL.3",
    title: "Draft holiday offer catalog",
    status: "in-progress",
    kind: "story",
    homeScopeName: "Holiday Launch",
    updatedAt: "2026-07-21T08:44:00Z",
  },
]

export const fixtureWorkSource: ScopedWorkSource = {
  summariesForScope(scopeId) {
    if (scopeId === NORTHSTAR.commerce) return commerceRollupWork
    if (scopeId === NORTHSTAR.holidayLaunch) return holidayWork
    if (scopeId === NORTHSTAR.checkoutReliability)
      return commerceWork.slice(0, 2)
    return []
  },
  commitmentsForSession(sessionId) {
    if (sessionId === NORTHSTAR.draftOffers) return [holidayWork[0]]
    return []
  },
}

export const fixtureAgents: readonly AgentRow[] = [
  {
    personaId: "neve",
    name: "Neve Laine",
    headline: "Design and chrome",
    hasPortrait: false,
  },
  {
    personaId: "vesper",
    name: "Vesper Sund",
    headline: "Scope contracts",
    hasPortrait: false,
  },
]

export const fixtureAttention: readonly AttentionItem[] = [
  {
    id: "att-1",
    agentName: "Vesper",
    subject: "Offer eligibility rules spike",
    notedFromName: "Holiday Launch",
  },
]

export const fixtureActivity: readonly ActivityItem[] = [
  {
    id: "activity-1",
    agentName: "Neve Laine",
    summary: "Replied in Draft launch offers",
    occurredAt: "2026-07-21T12:00:00.000Z",
    href: `/sessions/${NORTHSTAR.draftOffers}`,
  },
]

export const fixtureResources: readonly ResourceRow[] = [
  {
    id: "res-offer-brief",
    name: "Holiday offer brief",
    kind: "knowledge",
  },
  {
    id: "res-catalog-v2",
    name: "Offer catalog v2",
    kind: "artifact",
  },
  {
    id: "res-checkout-baseline",
    name: "Checkout latency baseline",
    kind: "evidence",
    mountedFromName: "Checkout Reliability",
  },
]

export const fixtureArtifactRows: readonly ResourceRow[] = [
  { id: "art-1", name: "Offer eligibility matrix", kind: "artifact" },
  { id: "art-2", name: "Draft offers outline", kind: "artifact" },
]

/**
 * Restricted mount indicator — the discovery policy surfaced that a mount
 * exists without granting access. No id, no name (spec §6 case 3).
 */
export const restrictedMountRow = {
  restricted: true as const,
  label: "Restricted workspace",
}

export const emptyProjectHome: ProjectHomeView = {
  header: {
    scopeId: "project:empty",
    kind: "project",
    name: "Greenfield",
    icon: "🌱",
    description: "A project with nothing in it yet.",
    status: "active",
  },
  workspaces: [],
  sessions: [],
  agents: [],
  resources: [],
  work: [],
  activity: [],
  attention: [],
}

export const archivedWorkspaceHome: WorkspaceHomeView = {
  header: {
    scopeId: "workspace:old-launch",
    kind: "workspace",
    name: "Spring Launch",
    icon: "🗃",
    description: "Archived after the spring campaign wrapped.",
    status: "archived",
  },
  sessions: [],
  agents: [],
  resources: [],
  work: [],
  activity: [],
  attention: [],
}
