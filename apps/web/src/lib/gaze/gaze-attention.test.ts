import { describe, expect, it } from "vitest"
import type { AttentionContext } from "@zigil/agent-react/attention"
import {
  attentionSelectionKey,
  serializeAttentionDraft,
} from "@zigil/agent-react/context-draft"

import { foldGazeIntoAttention } from "./gaze-attention"
import {
  advanceGazeDecay,
  GAZE_ATTENTION_DECAY_MS,
  initialGazeDecayState,
} from "./gaze-decay"
import { gazeRegionSelection, type GazeRegionDescriptor } from "./gaze-region"

// Fixture regions the user might look at. The behavioral assertions derive the
// gazed region and its exclusion key from these — nothing is hardcoded to a
// count or a literal key string.
const REGIONS: readonly GazeRegionDescriptor[] = [
  { id: "card-alpha", label: "Card Alpha" },
  { id: "card-beta", label: "Card Beta" },
]

function workspaceAttention(): AttentionContext {
  return {
    application: "sigil-chat",
    route: "/demos/evidence",
    workspace: { kind: "evidence-room", id: "corpus-1", label: "Corpus" },
    selection: { kind: "document", id: "doc-7", label: "Document 7" },
    selections: [{ kind: "document", id: "doc-7", label: "Document 7" }],
  }
}

describe("foldGazeIntoAttention", () => {
  it("leaves attention untouched when nothing is gazed", () => {
    const base = workspaceAttention()
    expect(foldGazeIntoAttention(base, null)).toBe(base)
  })

  it("rides a minimal envelope when the workspace publishes none", () => {
    const gaze = gazeRegionSelection(REGIONS[0]!)
    const folded = foldGazeIntoAttention(null, gaze)
    expect(folded?.application).toBe("sigil-chat")
    expect(folded?.selections).toContainEqual(gaze)
  })

  it("keeps the workspace's own selections alongside gaze", () => {
    const gaze = gazeRegionSelection(REGIONS[0]!)
    const folded = foldGazeIntoAttention(workspaceAttention(), gaze)
    expect(folded?.selection).toEqual({
      kind: "document",
      id: "doc-7",
      label: "Document 7",
    })
    expect(folded?.selections).toContainEqual(gaze)
  })

  it("replaces a stale look-point instead of trailing them", () => {
    const first = foldGazeIntoAttention(
      workspaceAttention(),
      gazeRegionSelection(REGIONS[0]!),
    )
    const second = foldGazeIntoAttention(
      first,
      gazeRegionSelection(REGIONS[1]!),
    )
    const gazeSelections = (second?.selections ?? []).filter(
      (selection) => selection.kind === "gaze",
    )
    expect(gazeSelections).toHaveLength(1)
    expect(gazeSelections[0]?.id).toBe(REGIONS[1]!.id)
  })
})

// The retrieval-is-not-use A/B, on the REAL delivery path: build the payload
// the agent would actually receive (serializeAttentionDraft applies exclusions
// + privacy exactly as the composer does), and prove gaze surfaces a region
// only when it is permitted to.
describe("gaze attention consequence (A/B)", () => {
  it("A: gaze on a region names that region in the delivered payload", () => {
    const looked = REGIONS[0]!
    const folded = foldGazeIntoAttention(
      workspaceAttention(),
      gazeRegionSelection(looked),
    )
    const delivered = serializeAttentionDraft(folded, "focused", [])
    expect(delivered).toContain(looked.label)
  })

  it("B: excluding that region in the tray keeps gaze from surfacing it", () => {
    const looked = REGIONS[0]!
    const gaze = gazeRegionSelection(looked)!
    const folded = foldGazeIntoAttention(workspaceAttention(), gaze)

    const excludeKey = attentionSelectionKey(gaze)
    const delivered = serializeAttentionDraft(folded, "focused", [excludeKey])

    // The gazed region is gone; the rest of the workspace attention remains.
    expect(delivered).not.toContain(looked.label)
    expect(delivered).toContain("Document 7")
  })

  it("withholds gaze at minimal privacy without any gaze-specific privacy code", () => {
    const looked = REGIONS[1]!
    const folded = foldGazeIntoAttention(
      workspaceAttention(),
      gazeRegionSelection(looked),
    )
    const minimal = serializeAttentionDraft(folded, "minimal", [])
    expect(minimal).not.toContain(looked.label)
  })
})

// The persistence guard for the "what about now?" bug: with capture live, a
// region the gaze has left must keep riding the payload for the decay window,
// then drop. Drives the real delivery path (fold + serialize) off the decay
// latch so the assertions are on the payload the agent actually receives.
function deliverGaze(
  decay: ReturnType<typeof initialGazeDecayState>,
  excludedKeys: readonly string[] = [],
): string {
  const selection = gazeRegionSelection(decay.region)
  return serializeAttentionDraft(
    foldGazeIntoAttention(workspaceAttention(), selection),
    "focused",
    excludedKeys,
  )
}

describe("gaze persists for a decay window across turns", () => {
  it("carries the region on a follow-up turn within the window, then drops it", () => {
    const looked = REGIONS[0]!
    const t0 = 1000

    // Turn 1: the gaze commits on the region and rides the delivered payload.
    let decay = advanceGazeDecay(initialGazeDecayState(), looked, t0)
    expect(deliverGaze(decay)).toContain(looked.label)

    // Between turns the gaze wanders onto unregistered chrome (null) — the
    // composer glance that types "what about now?" — still inside the window.
    decay = advanceGazeDecay(decay, null, t0 + GAZE_ATTENTION_DECAY_MS - 1)
    // Turn 2: same live capture, so the region is STILL delivered. (Pre-fix the
    // look-away nulled the selection immediately and this was empty.)
    expect(deliverGaze(decay)).toContain(looked.label)

    // Turn 3: the window has elapsed with no new gaze — the region is gone.
    decay = advanceGazeDecay(decay, null, t0 + GAZE_ATTENTION_DECAY_MS)
    expect(deliverGaze(decay)).not.toContain(looked.label)
  })

  it("still lets the tray exclude the retained region for a turn", () => {
    const looked = REGIONS[0]!
    // A region held over into the decay window (commit → look-away).
    let decay = advanceGazeDecay(initialGazeDecayState(), looked, 1000)
    decay = advanceGazeDecay(decay, null, 1500)
    const gaze = gazeRegionSelection(decay.region)!

    const delivered = deliverGaze(decay, [attentionSelectionKey(gaze)])
    // Persistence does not bypass the exclude control: an excluded retained
    // region is withheld exactly as a freshly-committed one would be.
    expect(delivered).not.toContain(looked.label)
    expect(delivered).toContain("Document 7")
  })
})
