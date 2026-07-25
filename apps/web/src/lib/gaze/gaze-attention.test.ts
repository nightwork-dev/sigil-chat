import { describe, expect, it } from "vitest"
import type { AttentionContext } from "@zigil/agent-react/attention"
import {
  attentionSelectionKey,
  serializeAttentionDraft,
} from "@zigil/agent-react/context-draft"

import { foldGazeIntoAttention } from "./gaze-attention"
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
    const second = foldGazeIntoAttention(first, gazeRegionSelection(REGIONS[1]!))
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
