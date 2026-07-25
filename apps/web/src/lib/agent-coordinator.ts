// Coordinator core — what becomes an agent turn, and nothing else.
//
// The coordinator is a conversational surface that decides what is chat and
// what is real work, delegates the work into the bound Eve session, and
// projects bounded progress back. It NEVER invokes a tool itself: every
// capability it reaches for arrives through the session it delegates into, so
// authorization stays where Eve and Gonk already enforce it. There is
// deliberately no tool-calling seam in this module to add one to.
//
// Everything here is host-neutral: no React, no network, no clock of its own.
// The bound session arrives as an injected port, which is what makes Slice 1
// of the coordinator spec falsifiable entirely in text — the queueing,
// idempotency, and steering rules hold identically whether the delegation was
// typed or spoken, because neither modality reaches this module.
//
// Four invariants, each locked by a test:
//
//   1. A delegation carries provenance (principal, persona, resource scope,
//      approval behaviour) and is idempotent by (sessionId, delegationId). A
//      replay produces no second turn — which matters most for speech, where
//      a retried transcription is an ordinary event, not a bug.
//   2. Delegations arriving while the session is busy QUEUE to a stated cap.
//      Overflow drops the OLDEST and surfaces that it did. Silently discarding
//      a request the user made is a defect, not backpressure.
//   3. Steering uses the supported path: cancel({ turnId }) settles before the
//      replacement is delivered. Never a concurrent send.
//   4. Progress projection is bounded (see ./coordinator-progress).
//
// Nothing in here throws. A port failure settles the turn as failed and the
// queue keeps draining; a coordinator that dies on one bad turn strands every
// request behind it.

import type { ToolApprovalMode } from "./agent-tool-approval"
import {
  EMPTY_PROGRESS,
  PROGRESS_BOUNDS,
  projectProgress,
  type ProgressBounds,
  type ProgressProjection,
  type ProgressUpdate,
} from "./coordinator-progress"

/** Whether the request was typed or dictated. Provenance only — every rule in
 *  this module holds identically for both. */
export type DelegationSource = "typed" | "spoken"

/**
 * Who is asking, as what, over which resources, under which approval
 * behaviour. Carried on every delegation so the adapter can attach it to the
 * turn; the coordinator refuses a delegation missing any of it rather than
 * letting an unattributed turn reach the session.
 */
export interface DelegationProvenance {
  readonly principalId: string
  readonly personaId: string
  readonly resourceScope: string
  readonly approvalMode: ToolApprovalMode
  readonly source: DelegationSource
}

export interface Delegation {
  /** Caller-assigned. Stable across a replay of the same request. */
  readonly delegationId: string
  /** The bound session. Scopes idempotency, so the same delegationId in a
   *  different session is a different delegation. */
  readonly sessionId: string
  readonly text: string
  readonly provenance: DelegationProvenance
}

export type CoordinatorTurnResult =
  | { readonly status: "succeeded" }
  | { readonly status: "failed"; readonly reason?: string }
  | { readonly status: "cancelled" }

/**
 * The bound session, as the coordinator needs it.
 *
 * `deliver` is the post-cancel send. Eve's client exposes one send route, but
 * keeping delivery distinct here is what makes the ordering invariant
 * testable: an adapter maps both onto `ClientSession.send`, while this module
 * can assert that a replacement never goes out before its cancel has settled.
 */
export interface CoordinatorSessionPort {
  /** True while the session is working, including work the coordinator did not
   *  start (another surface on the same thread). */
  isBusy(): boolean
  /** The turn id the caller has actually observed, if any. Steering targets
   *  this and only this. */
  activeTurnId(): string | undefined
  send(delegation: Delegation): Promise<CoordinatorTurnResult>
  /**
   * PORT CONTRACT: resolution of cancel is acknowledgement, NOT settlement of
   * the turn — eve resolves "accepted" while the cancelled turn is still
   * draining, and treats a stale turnId as a benign no-op. The coordinator
   * therefore holds delivery until the in-flight send()'s own promise
   * settles. What an adapter owes in return: after an acknowledged cancel,
   * the corresponding send() promise MUST eventually settle (eve guarantees
   * this — the stream ends), or steering will wait forever.
   */
  cancel(options: { readonly turnId: string }): Promise<void>
  deliver(delegation: Delegation): Promise<CoordinatorTurnResult>
}

export type DelegationRejection = "empty-text" | "incomplete-provenance"

export type DelegationAdmission =
  /** Handed to the session immediately. */
  | { readonly status: "started" }
  /** The session was busy; queued at this depth. */
  | { readonly status: "queued"; readonly depth: number }
  /** Same (sessionId, delegationId) already admitted. No second turn. */
  | { readonly status: "duplicate" }
  | { readonly status: "rejected"; readonly reason: DelegationRejection }

export type SteerOutcome =
  /** The observed turn was cancelled and the replacement delivered. */
  | { readonly status: "steered"; readonly cancelledTurnId: string }
  /** Nothing was running, so the replacement went through the normal path. */
  | { readonly status: "delegated"; readonly admission: DelegationAdmission }
  | { readonly status: "duplicate" }
  | { readonly status: "rejected"; readonly reason: DelegationRejection }

export type CoordinatorEvent =
  | { readonly type: "delegation-started"; readonly delegation: Delegation }
  | {
      readonly type: "delegation-queued"
      readonly delegation: Delegation
      readonly depth: number
    }
  /** The user's request was heard and then discarded. Always surfaced. */
  | {
      readonly type: "delegation-dropped"
      readonly delegation: Delegation
      readonly reason: "queue-overflow"
    }
  | { readonly type: "delegation-duplicate"; readonly delegation: Delegation }
  | {
      readonly type: "delegation-rejected"
      readonly delegation: Delegation
      readonly reason: DelegationRejection
    }
  | {
      readonly type: "turn-settled"
      readonly delegation: Delegation
      readonly result: CoordinatorTurnResult
    }
  | {
      readonly type: "steered"
      readonly delegation: Delegation
      readonly cancelledTurnId: string
    }

export interface CoordinatorBounds {
  /** How many busy-turn delegations wait before the oldest is dropped. */
  readonly queueCapacity: number
  /** How many (sessionId, delegationId) keys stay replay-proof. Sized well
   *  above the queue so a replay can never outlive the memory of it in any
   *  sequence the queue itself permits. */
  readonly idempotencyMemory: number
  readonly progress: ProgressBounds
}

export const COORDINATOR_BOUNDS: CoordinatorBounds = {
  queueCapacity: 4,
  idempotencyMemory: 256,
  progress: PROGRESS_BOUNDS,
}

export interface CoordinatorOptions {
  readonly port: CoordinatorSessionPort
  readonly bounds?: CoordinatorBounds
  readonly onEvent?: (event: CoordinatorEvent) => void
}

export interface AgentCoordinator {
  /** Admit a request. Synchronous: the answer is whether it became a turn, was
   *  queued, or was refused — not what the turn produced. */
  delegate(delegation: Delegation): DelegationAdmission
  /** Replace the turn the caller has observed. cancel({ turnId }) settles
   *  first; the replacement is delivered after. */
  steer(delegation: Delegation): Promise<SteerOutcome>
  /** Fold one progress or final update into the bounded projection. */
  noteProgress(update: ProgressUpdate): void
  progress(): ProgressProjection
  queueDepth(): number
  /** Delegations dropped to overflow, oldest first. The surface that shows
   *  them decides the wording; losing them silently is the defect. */
  dropped(): readonly Delegation[]
  /** Kick the queue when the session went idle on work the coordinator did not
   *  start. Turns it started drain on their own. */
  notifySessionIdle(): void
  /** Resolves when no turn is in flight and the queue is empty. */
  whenIdle(): Promise<void>
}

export function createAgentCoordinator({
  port,
  bounds = COORDINATOR_BOUNDS,
  onEvent,
}: CoordinatorOptions): AgentCoordinator {
  const queue: Delegation[] = []
  const droppedDelegations: Delegation[] = []
  const admitted = new Set<string>()
  const idleWaiters: Array<() => void> = []
  let progress: ProgressProjection = EMPTY_PROGRESS
  let inFlight: Delegation | undefined
  /** The running turn's own settlement — held so steering can await the
   *  cancelled turn actually ending, not merely the cancel being accepted. */
  let inFlightSettled: Promise<void> | undefined
  // Held across cancel-then-deliver so the queue cannot slip a send in
  // between and make two turns concurrent.
  let steering = false

  function emit(event: CoordinatorEvent): void {
    try {
      onEvent?.(event)
    } catch {
      // A listener's failure is not the coordinator's to propagate.
    }
  }

  function remember(key: string): void {
    admitted.add(key)
    if (admitted.size <= bounds.idempotencyMemory) return
    const oldest = admitted.values().next()
    if (!oldest.done) admitted.delete(oldest.value)
  }

  function settleIdleWaiters(): void {
    if (inFlight || steering || queue.length > 0) return
    while (idleWaiters.length > 0) idleWaiters.pop()?.()
  }

  async function runTurn(delegation: Delegation): Promise<void> {
    inFlight = delegation
    emit({ type: "delegation-started", delegation })
    let result: CoordinatorTurnResult
    try {
      result = await port.send(delegation)
    } catch (error) {
      result = { status: "failed", reason: errorReason(error) }
    }
    inFlight = undefined
    emit({ type: "turn-settled", delegation, result })
    pump()
  }

  function pump(): void {
    if (inFlight || steering) {
      settleIdleWaiters()
      return
    }
    const next = queue[0]
    if (!next) {
      settleIdleWaiters()
      return
    }
    if (port.isBusy()) return
    queue.shift()
    inFlightSettled = runTurn(next)
  }

  function enqueue(delegation: Delegation): DelegationAdmission {
    if (queue.length >= bounds.queueCapacity) {
      const oldest = queue.shift()
      if (oldest) {
        droppedDelegations.push(oldest)
        emit({
          type: "delegation-dropped",
          delegation: oldest,
          reason: "queue-overflow",
        })
      }
    }
    queue.push(delegation)
    emit({ type: "delegation-queued", delegation, depth: queue.length })
    return { status: "queued", depth: queue.length }
  }

  /** Refusal reason, or undefined when the delegation may proceed. Remembers
   *  the key as a side effect, so calling it twice for one delegation is
   *  itself a duplicate. */
  function refuse(
    delegation: Delegation,
  ):
    | { readonly status: "duplicate" }
    | { readonly status: "rejected"; readonly reason: DelegationRejection }
    | undefined {
    const rejection = rejectionFor(delegation)
    if (rejection) {
      emit({ type: "delegation-rejected", delegation, reason: rejection })
      return { status: "rejected", reason: rejection }
    }
    const key = delegationKey(delegation)
    if (admitted.has(key)) {
      emit({ type: "delegation-duplicate", delegation })
      return { status: "duplicate" }
    }
    remember(key)
    return undefined
  }

  /** Start now or queue, for a delegation that has already been admitted. */
  function dispatch(delegation: Delegation): DelegationAdmission {
    if (inFlight || steering || port.isBusy() || queue.length > 0) {
      return enqueue(delegation)
    }
    inFlightSettled = runTurn(delegation)
    return { status: "started" }
  }

  function delegate(delegation: Delegation): DelegationAdmission {
    return refuse(delegation) ?? dispatch(delegation)
  }

  async function steer(delegation: Delegation): Promise<SteerOutcome> {
    const refused = refuse(delegation)
    if (refused) return refused

    const turnId = port.activeTurnId()
    if (!turnId) {
      // Nothing observed to steer. Take the ordinary path rather than
      // cancelling blind — an unqualified cancel could stop a turn the
      // coordinator never saw.
      return { status: "delegated", admission: dispatch(delegation) }
    }

    steering = true
    try {
      await port.cancel({ turnId })
    } catch {
      // A cancel that failed still must not become a concurrent send: the
      // replacement is queued instead, and the observed turn settles on its
      // own terms.
      steering = false
      queue.unshift(delegation)
      pump()
      return {
        status: "delegated",
        admission: { status: "queued", depth: queue.length },
      }
    }

    // Cancel resolution is acknowledgement, not settlement — the real port
    // resolves "accepted" while the cancelled turn is still draining. Deliver
    // must not go out until that turn's own send() has settled, or the two
    // are concurrent in exactly the way this method exists to prevent. The
    // `steering` flag holds the queue back meanwhile.
    if (inFlightSettled) await inFlightSettled

    let result: CoordinatorTurnResult
    try {
      result = await port.deliver(delegation)
    } catch (error) {
      result = { status: "failed", reason: errorReason(error) }
    }
    steering = false
    emit({ type: "steered", delegation, cancelledTurnId: turnId })
    emit({ type: "turn-settled", delegation, result })
    pump()
    return { status: "steered", cancelledTurnId: turnId }
  }

  return {
    delegate,
    steer,
    noteProgress(update) {
      progress = projectProgress(progress, update, bounds.progress)
    },
    progress: () => progress,
    queueDepth: () => queue.length,
    dropped: () => [...droppedDelegations],
    notifySessionIdle: pump,
    whenIdle: () =>
      new Promise<void>((resolve) => {
        if (!inFlight && !steering && queue.length === 0) {
          resolve()
          return
        }
        idleWaiters.push(resolve)
      }),
  }
}

/** Idempotency key. NUL-joined so no id containing the separator can forge a
 *  collision with a different (sessionId, delegationId) pair. */
export function delegationKey(delegation: Delegation): string {
  return `${delegation.sessionId}\u0000${delegation.delegationId}`
}

function rejectionFor(delegation: Delegation): DelegationRejection | undefined {
  const { principalId, personaId, resourceScope, approvalMode, source } =
    delegation.provenance
  if (
    !principalId.trim() ||
    !personaId.trim() ||
    !resourceScope.trim() ||
    !approvalMode ||
    !source
  ) {
    return "incomplete-provenance"
  }
  if (!delegation.text.trim()) return "empty-text"
  return undefined
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
