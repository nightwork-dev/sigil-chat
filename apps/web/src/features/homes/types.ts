// Product homes — view-model contracts (SC.7).
//
// Every type here is PRESENTATION DATA. The adapter that produces it reads
// only permission-filtered inputs (the nav summary, thread lists, fixtures)
// and never invents scope ids or names the principal cannot see. The three
// rules the spec makes contractual, restated at the type boundary:
//
// 1. Entered-via is presentation only. `OwnershipLabel.enteredViaName` is a
//    display path; carrying it confers nothing (spec §7).
// 2. Ownership is labelled quietly. `canonicalOwnerName` appears only when
//    the owner scope is itself visible to the principal — otherwise the label
//    is omitted, never substituted (spec §2, §7 fallback).
// 3. Denied mounts are non-identifying. A restricted row carries no id and no
//    name — existence is all the discovery policy permits (spec §6, §7).

import type { StoryStatus, WorkKind } from "@workspace/work-items-store/types"

export type HomeKind = "project" | "workspace" | "session"

export interface HomeHeader {
  readonly scopeId: string
  readonly kind: HomeKind
  readonly name: string
  readonly icon?: string
  readonly description?: string
  readonly status: "active" | "archived"
}

/** Quiet ownership/via labelling — projection, never authority. */
export interface OwnershipLabel {
  /** The visible project this home was entered through (when not the owner). */
  readonly enteredViaName?: string
  /** The via project's id — used to propagate the perspective into links so
   *  navigation out of this home keeps the entered-via path (spec §7). */
  readonly enteredViaScopeId?: string
  /** The canonical owner, shown only when visible to this principal. */
  readonly canonicalOwnerName?: string
}

export interface WorkspaceRow {
  readonly id: string
  readonly name: string
  readonly icon?: string
  readonly description?: string
  readonly status: "active" | "archived"
  /** "owned" = homed here; "mounted" = homed elsewhere, participating here. */
  readonly relation: "owned" | "mounted"
  /** For mounted rows: the canonical owner's name, when it is visible. */
  readonly canonicalOwnerName?: string
  /** Navigation target; mounted rows carry the entered-via perspective. */
  readonly href: string
}

/**
 * A mount indicator the discovery policy surfaced without access. Renders
 * inert — no id, no name, no link. `requestAccess` is the only affordance.
 */
export interface RestrictedRow {
  readonly restricted: true
  readonly label: string
}

export type WorkspaceListRow = WorkspaceRow | RestrictedRow

export function isRestrictedRow(row: WorkspaceListRow): row is RestrictedRow {
  return (row as RestrictedRow).restricted === true
}

export interface SessionRow {
  readonly id: string
  readonly title: string
  readonly personaId: string
  readonly status: "active" | "archived"
  readonly updatedAt: string
  /** Home workspace when the session has one; personal sessions omit it. */
  readonly workspaceId?: string
  readonly workspaceName?: string
  /** Navigation target; carries the current perspective when the session's
   *  home is a mounted workspace entered via a non-owner project. */
  readonly href: string
}

export interface AgentRow {
  readonly personaId: string
  readonly name: string
  readonly headline?: string
  readonly hasPortrait: boolean
}

export interface ResourceRow {
  readonly id: string
  readonly name: string
  readonly kind: "artifact" | "evidence" | "knowledge" | "saved-view"
  readonly mediaType?: string
  /** Present when the record participates here via a mount. */
  readonly mountedFromName?: string
  /** Authenticated native resource URL. Opens outside the SPA router. */
  readonly nativeHref?: string
}

export interface ActivityItem {
  readonly id: string
  readonly agentName: string
  readonly summary: string
  readonly occurredAt: string
  readonly href?: string
}

/** Scoped-work summary — the shape SC.5's durable board query will serve. */
export interface WorkSummaryItem {
  readonly id: string
  readonly title: string
  readonly status: StoryStatus
  readonly kind?: WorkKind
  /** Set when the item's canonical home is another visible scope. */
  readonly homeScopeName?: string
  readonly updatedAt: string
  /** Deep link to the editable durable work record. */
  readonly href?: string
}

/** Agent attention, cross-view labelled. Projection only (spec §3). */
export interface AttentionItem {
  readonly id: string
  readonly agentName: string
  readonly subject: string
  /** Where the attention was noted from, when it was another scope. */
  readonly notedFromName?: string
  readonly href?: string
}

export interface ProjectHomeView {
  readonly header: HomeHeader
  readonly workspaces: readonly WorkspaceListRow[]
  readonly sessions: readonly SessionRow[]
  readonly agents: readonly AgentRow[]
  /** Artifacts, knowledge, evidence, saved views — homed here or mounted
   *  into the project, identity-deduped upstream (spec §8.1, §11.1). */
  readonly resources: readonly ResourceRow[]
  readonly work: readonly WorkSummaryItem[]
  readonly activity: readonly ActivityItem[]
  readonly attention: readonly AttentionItem[]
}

export interface WorkspaceHomeView {
  readonly header: HomeHeader
  readonly ownership?: OwnershipLabel
  readonly sessions: readonly SessionRow[]
  readonly agents: readonly AgentRow[]
  readonly resources: readonly ResourceRow[]
  readonly work: readonly WorkSummaryItem[]
  readonly activity: readonly ActivityItem[]
  readonly attention: readonly AttentionItem[]
}

export interface SessionHomeView {
  readonly header: HomeHeader
  /** The session's home workspace — its canonical container, when visible. */
  readonly workspaceName?: string
  readonly ownership?: OwnershipLabel
  readonly artifacts: readonly ResourceRow[]
  readonly commitments: readonly WorkSummaryItem[]
  readonly activity: readonly ActivityItem[]
  readonly attention: readonly AttentionItem[]
}

/** Load lifecycle for a home. Denied follows the spec §7 product rule: 403
 *  only when existence is discoverable to the principal, otherwise 404. */
export type HomeState<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "not-found" }
  | { readonly kind: "denied"; readonly discoverable: boolean }
  | { readonly kind: "ready"; readonly view: T }

/**
 * Scoped-work source — the seam SC.5 replaces with the durable board query.
 * Components never fetch work directly; they receive whatever this adapter
 * returns for the scope. The fixture implementation is presentation data
 * only and carries no authority semantics.
 */
export interface ScopedWorkSource {
  summariesForScope(scopeId: string): readonly WorkSummaryItem[]
  commitmentsForSession(sessionId: string): readonly WorkSummaryItem[]
}
