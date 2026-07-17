// Review — the headless rulebook. Pure, store-agnostic functions over the
// generic types in ./types. No I/O, no React, no Date.now: callers pass `nowMs`
// (keeps these deterministic + testable, and safe to call anywhere). The host
// owns the list and persistence; these encode the transitions + queries.

import type {
  AcceptanceCheck,
  AcceptanceReceipt,
  Annotation,
  AnnotationKind,
  Actor,
  Decision,
} from "./types"

// ─── Decisions ───────────────────────────────────────────────────────────────

/** Create an OPEN decision. Agents and humans may both propose. */
export function proposeDecision<TRef = string>(
  input: { id: string; ref: TRef; kind: string; title: string; body: string; proposedBy: Actor },
  nowMs: number,
): Decision<TRef> {
  return {
    id: input.id,
    ref: input.ref,
    kind: input.kind,
    title: input.title,
    body: input.body,
    status: "open",
    proposedBy: input.proposedBy,
    createdMs: nowMs,
  }
}

/**
 * Lock a decision — the human-only approval. Only an OPEN decision can be
 * locked; anything else is returned unchanged (idempotent, never throws), so a
 * double-lock or a lock on a superseded decision is a no-op, not a corruption.
 */
export function lockDecision<TRef>(decision: Decision<TRef>, nowMs: number): Decision<TRef> {
  if (decision.status !== "open") return decision
  return { ...decision, status: "locked", resolvedBy: "human", resolvedMs: nowMs }
}

/** Mark a decision superseded (a newer one replaces it). Open or locked → superseded. */
export function supersedeDecision<TRef>(decision: Decision<TRef>, nowMs: number): Decision<TRef> {
  if (decision.status === "superseded") return decision
  return { ...decision, status: "superseded", resolvedMs: nowMs }
}

export function openDecisions<TRef>(decisions: readonly Decision<TRef>[]): Decision<TRef>[] {
  return decisions.filter((d) => d.status === "open")
}

/** Count of decisions still awaiting a human lock — the "needs you" number. */
export function openDecisionCount<TRef>(decisions: readonly Decision<TRef>[]): number {
  return openDecisions(decisions).length
}

// ─── Annotations ─────────────────────────────────────────────────────────────

export function proposeAnnotation<TAnchor = unknown>(
  input: { id: string; anchor: TAnchor | null; kind: AnnotationKind; body: string; author: Actor },
  nowMs: number,
): Annotation<TAnchor> {
  return {
    id: input.id,
    anchor: input.anchor,
    kind: input.kind,
    body: input.body,
    author: input.author,
    status: "active",
    createdMs: nowMs,
  }
}

/** Dismiss an active annotation (reject it). No-op if not active. */
export function dismissAnnotation<TAnchor>(
  annotation: Annotation<TAnchor>,
  resolutionNote: string | undefined,
  nowMs: number,
): Annotation<TAnchor> {
  if (annotation.status !== "active") return annotation
  return { ...annotation, status: "dismissed", resolutionNote, resolvedMs: nowMs }
}

/** Convert an active annotation into a durable note (promote it). No-op if not active. */
export function convertAnnotation<TAnchor>(
  annotation: Annotation<TAnchor>,
  resolutionNote: string | undefined,
  nowMs: number,
): Annotation<TAnchor> {
  if (annotation.status !== "active") return annotation
  return { ...annotation, status: "converted", resolutionNote, resolvedMs: nowMs }
}

/**
 * Review debt — active annotations whose anchor no longer resolves (`anchor`
 * is null). These are the orphaned items a triage surface must show so review
 * never silently loses a flag when the content it pointed at moved or vanished.
 */
export function findOrphanAnnotations<TAnchor>(
  annotations: readonly Annotation<TAnchor>[],
): Annotation<TAnchor>[] {
  return annotations.filter((a) => a.status === "active" && a.anchor === null)
}

/** Active annotations of a given kind (e.g. all open "approval"s). */
export function annotationsByKind<TAnchor>(
  annotations: readonly Annotation<TAnchor>[],
  kind: AnnotationKind,
): Annotation<TAnchor>[] {
  return annotations.filter((a) => a.status === "active" && a.kind === kind)
}

// ─── Acceptance ──────────────────────────────────────────────────────────────

/** An acceptance pass is complete only when every check is ticked. */
export function acceptanceComplete(checklist: readonly AcceptanceCheck[]): boolean {
  return checklist.length > 0 && checklist.every((c) => c.checked)
}

/** Build a receipt from a completed pass. Returns null if the checklist isn't complete. */
export function makeAcceptanceReceipt<TRef = string>(
  input: { ref: TRef; reviewer: string; device?: string; notes?: string; checklist: AcceptanceCheck[] },
  nowMs: number,
): AcceptanceReceipt<TRef> | null {
  if (!acceptanceComplete(input.checklist)) return null
  return {
    ref: input.ref,
    reviewer: input.reviewer,
    device: input.device,
    notes: input.notes,
    checklist: input.checklist,
    acceptedMs: nowMs,
  }
}
