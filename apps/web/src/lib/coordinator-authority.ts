// The announcement door for delegated authority.
//
// The rules themselves — the distinct principal, the narrow grant, the
// prose-proof decision path — moved to @workspace/agent-contracts so the
// agent-side coordinator MCP server shares ONE copy of them rather than
// forking a second. This module re-exports that pure core and adds the one
// thing that needs a host: the announcement a voice may speak about a pending
// approval, which composes this app's speakable-text projection.
//
// The signature is one-directional on purpose: a decision goes in, words come
// out, and nothing a listener or a model says can travel back the other way.
// The grant is never carried here; it happens on another surface.

export * from "@workspace/agent-contracts/coordinator-authority"
import type { ApprovalDecision } from "@workspace/agent-contracts/coordinator-authority"

import { announceAuthorization } from "./speakable-text"

/**
 * What a voice may say about a pending approval.
 *
 * Composes announceAuthorization rather than restating it, so the "no URL, no
 * receipt, no outcome" rule stays enforced in one place. An out-of-band
 * decision becomes a plain "needs your approval" line; an already-authorized
 * one says nothing, because there is nothing for the human to do.
 */
export function announceApprovalDecision(input: {
  readonly decision: ApprovalDecision
  readonly displayName: string
}): string | undefined {
  if (input.decision.status !== "out-of-band") return undefined
  return announceAuthorization({
    displayName: input.displayName,
    state: "required",
  })
}
