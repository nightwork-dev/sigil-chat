// Review — the generic data model for a two-actor (agent ↔ human) review loop
// over any content. Agents PROPOSE, humans APPROVE/LOCK; annotations anchor to
// durable regions so review survives redrafting; "review debt" surfaces
// orphaned items; an acceptance receipt records a human sign-off.
//
// Everything here is DOMAIN-FREE. `TRef` is whatever the host uses to reference
// the thing under review (a document id, a `{docId, sectionId}`, …); `TAnchor`
// is however the host addresses a region within it. The host owns persistence;
// these are the shapes + a headless rulebook (see ./logic).

/** open → locked (human-only) ; superseded when a newer decision replaces it. */
export type DecisionStatus = "open" | "locked" | "superseded"

/** Who acts. The collaboration contract, in data form: agents propose, humans lock. */
export type Actor = "agent" | "human"

export interface Decision<TRef = string> {
  id: string
  /** What this decision bears on (host-defined reference). */
  ref: TRef
  /** Caller-defined taxonomy label (e.g. "craft" | "canon" | "structure"). No fixed set. */
  kind: string
  title: string
  body: string
  status: DecisionStatus
  /** Who proposed it. */
  proposedBy: Actor
  /** Only a human may lock (see {@link lockDecision}); set when resolved. */
  resolvedBy?: "human"
  createdMs: number
  resolvedMs?: number
}

export type AnnotationKind = "note" | "flag" | "question" | "approval"

/** active → dismissed (rejected) | converted (promoted into a durable note). */
export type AnnotationStatus = "active" | "dismissed" | "converted"

export interface Annotation<TAnchor = unknown> {
  id: string
  /**
   * Where this annotation points. Host-defined so it can be a stable, redraft-
   * surviving anchor (a passage id) rather than a fragile offset. `null` = the
   * anchor no longer resolves (see {@link findOrphanAnnotations}).
   */
  anchor: TAnchor | null
  kind: AnnotationKind
  body: string
  author: Actor
  status: AnnotationStatus
  /** Set when dismissed/converted — why it was resolved that way. */
  resolutionNote?: string
  resolvedMs?: number
  createdMs: number
}

/** The content-variant review lifecycle (a draft, an image build, an audio take). */
export type ReviewStatus = "proposed" | "current" | "superseded" | "rejected"

/**
 * Display-shaped history entry for a reviewed content variant.
 *
 * Hosts adapt their domain model into this shape. `details` deliberately
 * carries already-formatted facts (for example "1,240 words", "1080p", or
 * "take 3") so the review package does not acquire document-, image-, or
 * audio-specific fields.
 */
export interface ReviewRevision {
  id: string
  label: string
  status: ReviewStatus
  /** The revision this one descends from, when the host tracks lineage. */
  parentId?: string
  authoredBy: string
  details?: readonly string[]
  note?: string
}

export interface AcceptanceCheck {
  id: string
  label: string
  checked: boolean
}

/** A human sign-off receipt — the persisted output of an acceptance pass. */
export interface AcceptanceReceipt<TRef = string> {
  ref: TRef
  reviewer: string
  device?: string
  notes?: string
  checklist: AcceptanceCheck[]
  acceptedMs: number
}
