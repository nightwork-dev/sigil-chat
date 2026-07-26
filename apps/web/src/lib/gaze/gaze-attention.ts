// Folding gaze into the existing attention envelope.
//
// The whole point of VOX.7 capability 1: gaze must ride the SAME payload text
// chat already sends, never a parallel gaze/voice context format. So this does
// exactly one thing — append the current gaze selection to the published
// AttentionContext's `selections`. Everything downstream (the context tray's
// preview + exclude buttons, `applyAttentionExclusions`, privacy gating in
// `serializeAttention`, the bounded-size fit) then treats gaze identically to
// any workspace selection, for free.
//
// Consequences that fall out of choosing `selections[]` rather than a bespoke
// field, and that we rely on rather than re-implement:
//   • Excludable: the tray renders each selection with an exclude control, so a
//     user can drop the gaze region for a turn (the retrieval-is-not-use A/B).
//   • Privacy-gated: `minimal` privacy drops `selections` entirely, so gaze is
//     withheld at minimal without any gaze-specific privacy code.
//   • Advisory only: attention is never authorization — tool access still
//     re-authorizes against resource scope regardless of what gaze surfaces.

import type {
  AttentionContext,
  AttentionSelection,
} from "@zigil/agent-react/attention"

import { GAZE_SELECTION_KIND } from "./gaze-region"

/**
 * Return `base` with the current gaze selection folded into `selections`.
 *
 * - `gaze === null` returns `base` untouched (nothing is being looked at, or
 *   capture is off — gaze adds nothing).
 * - Any prior gaze-kind selection is dropped first: gaze is one live
 *   look-point, not an accumulating trail of stale ones.
 * - When `base` is null (a workspace that publishes no attention) gaze still
 *   rides a minimal `{ application, route }` envelope so "what am I looking
 *   at?" is answerable everywhere.
 */
export function foldGazeIntoAttention(
  base: AttentionContext | null,
  gaze: AttentionSelection | null,
): AttentionContext | null {
  if (!gaze) return base

  const scaffold: AttentionContext = base ?? {
    application: "sigil-chat",
    route: "/",
  }

  const priorSelections = scaffold.selections ?? []
  const withoutStaleGaze = priorSelections.filter(
    (selection) => selection.kind !== GAZE_SELECTION_KIND,
  )

  return {
    ...scaffold,
    selections: [...withoutStaleGaze, gaze],
  }
}
