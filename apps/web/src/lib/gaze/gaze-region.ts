// Mapping a gaze point to an attention region.
//
// Gaze is ADVISORY attention, not a new context format: the region under the
// user's gaze becomes an ordinary AttentionSelection folded into the same
// bounded, exclusion-filtered, privacy-gated envelope every other source uses
// (gaze-attention.ts does the folding). This module owns only the identity
// half: which on-screen region is being looked at, and how that becomes a
// selection.
//
// Regions opt in from the DOM with `data-gaze-id` (+ optional
// `data-gaze-label`). The capture loop resolves the element under the gaze
// point and walks up to the nearest opted-in ancestor. The walk itself is a
// pure function over a dataset chain so it is testable without a DOM; the thin
// `gazeRegionFromElement` adapter is the only browser-touching part.

import type { AttentionSelection } from "@zigil/agent-react/attention"

/** The one kind every gaze-derived selection carries. A single stable kind is
 *  what lets a user exclude "the thing I'm looking at" by identity and what
 *  lets the fold replace a stale look-point instead of trailing them. */
export const GAZE_SELECTION_KIND = "gaze"

/** The portrait's region id — meet-gaze (meet-gaze.ts) watches for this. */
export const GAZE_PORTRAIT_REGION_ID = "agent-portrait"

export interface GazeRegionDescriptor {
  readonly id: string
  readonly label: string
}

/** The subset of `HTMLElement.dataset` this module reads. Kept structural so
 *  the resolver is a pure function, not a DOM dependency. */
export interface GazeDatasetLike {
  readonly gazeId?: string
  readonly gazeLabel?: string
}

/**
 * The nearest opted-in region in a dataset chain ordered innermost →
 * outermost (as produced by walking an element up to the document root).
 * Returns null when the gaze point is over nothing that opted in — which is
 * how "looking at empty chrome" correctly surfaces no attention.
 */
export function gazeRegionFromChain(
  chain: readonly GazeDatasetLike[],
): GazeRegionDescriptor | null {
  for (const dataset of chain) {
    const id = dataset.gazeId?.trim()
    if (id) {
      const label = dataset.gazeLabel?.trim()
      return { id, label: label && label.length > 0 ? label : id }
    }
  }
  return null
}

/**
 * The gaze region under a real DOM element, or null. Browser-only adapter over
 * the pure {@link gazeRegionFromChain}: it builds the innermost-first dataset
 * chain and delegates the actual decision.
 */
export function gazeRegionFromElement(
  element: Element | null,
): GazeRegionDescriptor | null {
  const chain: GazeDatasetLike[] = []
  for (
    let node: Element | null = element;
    node;
    node = node.parentElement
  ) {
    if (node instanceof HTMLElement) chain.push(node.dataset)
  }
  return gazeRegionFromChain(chain)
}

/**
 * The AttentionSelection for a gazed region, or null when nothing is gazed.
 * `detail.source = "gaze"` marks the selection as glance-derived (advisory,
 * not an explicit click) so the agent — and the context tray — can tell it
 * apart from a deliberate selection.
 */
export function gazeRegionSelection(
  region: GazeRegionDescriptor | null,
): AttentionSelection | null {
  if (!region) return null
  return {
    kind: GAZE_SELECTION_KIND,
    id: region.id,
    label: region.label,
    detail: { source: "gaze" },
  }
}
