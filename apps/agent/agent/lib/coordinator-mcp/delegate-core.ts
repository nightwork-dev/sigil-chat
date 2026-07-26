// delegate_to_eve, decided in text before anything touches Eve.
//
// The whole security spine of VOX.6.1 lives in this one function, and it is
// pure: given the coordinator's principal, the scope its authority is checked
// against, the capability a grant must name, a snapshot of grants, and an
// injected Eve port, it decides — via the SHARED decideDelegatedApproval, not
// a second copy of the rules — whether the coordinator may delegate, and only
// then submits.
//
// Two invariants, each test-locked:
//   1. Authority gates submission in BOTH directions. A matching active grant
//      authorizes the delegation and the decision carries the grant id (the
//      receipt). No grant — revoked, absent, wrong scope/capability — refuses,
//      and the Eve port is NEVER called. Authority is checked before reach,
//      not after.
//   2. Only speakable text crosses back. The outcome carries Eve's completed
//      message and nothing else; the port already dropped events/data, and
//      this function never reads them.

import {
  decideDelegatedApproval,
  type CoordinatorAuthorityGrant,
} from "@workspace/agent-contracts/coordinator-authority"
import type { ScopeAuthorizationAction } from "@workspace/agent-contracts/scope-authorization"

import type { EveDelegatePort } from "./eve-delegate-port"

/** The action a delegation asks Eve to perform on the user's behalf. `tool` —
 *  running an application capability — is what delegation is for. */
const DELEGATION_ACTION: ScopeAuthorizationAction = "tool"

/** What the model may speak when it is not authorized to delegate here. Plain,
 *  and carrying no receipt, scope, or grant — a refusal is not a hint. */
export const UNAUTHORIZED_SPOKEN =
  "I'm not authorized to do that here. You can approve it from the app, then ask me again."
/** What the model hears back when it called with nothing to carry out. */
export const EMPTY_REQUEST_SPOKEN = "I didn't catch a request to carry out."
/** The delegation reached Eve but Eve produced nothing readable. */
export const NOTHING_TO_SAY_SPOKEN =
  "I did that, but there's nothing to read back."
/** Eve accepted the turn but ended in failure. */
export const DELEGATION_FAILED_SPOKEN =
  "I tried to do that, but it didn't go through."
/** The turn is still running past the bounded wait. Eve keeps working on its
 *  own session; the user is told rather than left in silence — the ~32s
 *  realtime reset makes a silent hang the worst outcome. */
export const STILL_WORKING_SPOKEN =
  "I'm still working on that — give me a moment and ask me how it went."
/** How long to wait for Eve before speaking "still working", short of the
 *  realtime-websocket reset window. */
export const DEFAULT_SUBMIT_TIMEOUT_MS = 22_000

export interface DelegateCoreContext {
  /** `coordinator:<userId>` — the borrowing principal, never the user. */
  readonly coordinatorPrincipalId: string
  /** The container scope (`project:`/`workspace:`) authority is checked in. */
  readonly authorityResourceScope: string
  /** The capability class a grant must name to authorize delegation. */
  readonly capability: string
  /** Snapshot of delegated grants. decideDelegatedApproval re-checks each. */
  readonly grants: readonly CoordinatorAuthorityGrant[]
  readonly port: EveDelegatePort
  /** Labels the decision; confers nothing. Injected so tests are deterministic. */
  readonly createActionId: () => string
  /** Bounded wait before the coordinator speaks "still working". Defaults to
   *  DEFAULT_SUBMIT_TIMEOUT_MS; a non-positive value waits unbounded. */
  readonly submitTimeoutMs?: number
}

export type DelegateOutcome =
  /** Authorized and delegated. `grantId` is the observable receipt. */
  | {
      readonly status: "delegated"
      readonly spoken: string
      readonly grantId: string
    }
  /** Refused before ever reaching Eve, or a request with no content. */
  | {
      readonly status: "refused"
      readonly spoken: string
      readonly reason: "no-authority" | "empty-request"
    }
  /** Reached Eve under authority, but the turn failed. Still carries the
   *  receipt: the grant DID authorize a real attempt. */
  | {
      readonly status: "failed"
      readonly spoken: string
      readonly grantId: string
    }
  /** Authorized and submitted, but Eve had not answered by the bounded wait.
   *  The turn keeps running on Eve's session; the user is told, not hung. */
  | {
      readonly status: "working"
      readonly spoken: string
      readonly grantId: string
    }

/**
 * Decide, then (only if authorized) delegate. The return is entirely
 * speakable: `spoken` is the one string the realtime model should voice, and
 * no field ever carries Eve's tool output, events, or reasoning.
 */
export async function delegateToEve(
  context: DelegateCoreContext,
  request: string,
): Promise<DelegateOutcome> {
  if (!request.trim()) {
    return {
      status: "refused",
      spoken: EMPTY_REQUEST_SPOKEN,
      reason: "empty-request",
    }
  }

  const decision = decideDelegatedApproval({
    request: {
      actionId: context.createActionId(),
      action: DELEGATION_ACTION,
      capability: context.capability,
      principalId: context.coordinatorPrincipalId,
      resourceScope: context.authorityResourceScope,
    },
    grants: context.grants,
  })

  if (decision.status !== "auto-approved") {
    // No authority: the Eve port is never touched. Refusal before reach.
    return {
      status: "refused",
      spoken: UNAUTHORIZED_SPOKEN,
      reason: "no-authority",
    }
  }

  const { grantId } = decision
  const result = await withBoundedWait(
    context.port.submit(request),
    context.submitTimeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS,
  )
  if (result === TIMED_OUT) {
    return { status: "working", spoken: STILL_WORKING_SPOKEN, grantId }
  }

  const spoken = result.message?.trim()
  if (result.status === "failed") {
    return {
      status: "failed",
      spoken: spoken || DELEGATION_FAILED_SPOKEN,
      grantId,
    }
  }
  return {
    status: "delegated",
    spoken: spoken || NOTHING_TO_SAY_SPOKEN,
    grantId,
  }
}

const TIMED_OUT = Symbol("delegate-timed-out")

/** Resolve with the submission's result, or TIMED_OUT if the bound elapses
 *  first. A non-positive bound waits unbounded (the timer is never armed). */
async function withBoundedWait<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMED_OUT> {
  if (timeoutMs <= 0) return work
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
