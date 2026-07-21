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
  AgentRow,
  AttentionItem,
  ProjectHomeView,
  ResourceRow,
  ScopedWorkSource,
  WorkspaceHomeView,
  WorkSummaryItem,
} from "./types"

export const NORTHSTAR = {
  installation: "installation:northstar",
  organization: "org:northstar",
  commerce: "project:commerce-platform",
  brand: "project:brand",
  checkoutReliability: "workspace:checkout-reliability",
  holidayLaunch: "workspace:holiday-launch",
  draftOffers: "session:draft-holiday-offers",
} as const

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
    if (scopeId === NORTHSTAR.checkoutReliability) return commerceWork.slice(0, 2)
    return []
  },
  commitmentsForSession(sessionId) {
    if (sessionId === NORTHSTAR.draftOffers) return [holidayWork[0]]
    return []
  },
}

export const fixtureAgents: readonly AgentRow[] = [
  { personaId: "neve", name: "Neve Laine", headline: "Design and chrome" },
  { personaId: "vesper", name: "Vesper Sund", headline: "Scope contracts" },
]

export const fixtureAttention: readonly AttentionItem[] = [
  {
    id: "att-1",
    agentName: "Vesper",
    subject: "Offer eligibility rules spike",
    notedFromName: "Holiday Launch",
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
  work: [],
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
  attention: [],
}
