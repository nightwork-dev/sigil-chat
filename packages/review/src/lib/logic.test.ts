import { describe, expect, it } from "vitest"

import {
  acceptanceComplete,
  convertAnnotation,
  dismissAnnotation,
  findOrphanAnnotations,
  lockDecision,
  makeAcceptanceReceipt,
  openDecisionCount,
  openDecisions,
  proposeAnnotation,
  proposeDecision,
  supersedeDecision,
} from "./logic"
import type { Annotation } from "./types"

const NOW = 1_000

describe("decisions", () => {
  it("proposeDecision starts open, keeps the proposer", () => {
    const d = proposeDecision({ id: "d1", ref: "doc1", kind: "craft", title: "t", body: "b", proposedBy: "agent" }, NOW)
    expect(d.status).toBe("open")
    expect(d.proposedBy).toBe("agent")
    expect(d.resolvedBy).toBeUndefined()
    expect(d.createdMs).toBe(NOW)
  })

  it("lockDecision locks an OPEN decision as human-resolved", () => {
    const d = proposeDecision({ id: "d1", ref: "doc1", kind: "craft", title: "t", body: "b", proposedBy: "agent" }, NOW)
    const locked = lockDecision(d, 2_000)
    expect(locked.status).toBe("locked")
    expect(locked.resolvedBy).toBe("human")
    expect(locked.resolvedMs).toBe(2_000)
  })

  it("lockDecision is a no-op on a non-open decision (idempotent, never corrupts)", () => {
    const d = proposeDecision({ id: "d1", ref: "doc1", kind: "craft", title: "t", body: "b", proposedBy: "human" }, NOW)
    const locked = lockDecision(d, 2_000)
    expect(lockDecision(locked, 3_000)).toBe(locked) // second lock returns the same object
    expect(supersedeDecision(d, 4_000).status).toBe("superseded")
    expect(lockDecision(supersedeDecision(d, 4_000), 5_000).status).toBe("superseded")
  })

  it("openDecisions / count filter to status open", () => {
    const list = [
      proposeDecision({ id: "a", ref: "x", kind: "k", title: "t", body: "b", proposedBy: "agent" }, NOW),
      lockDecision(proposeDecision({ id: "b", ref: "x", kind: "k", title: "t", body: "b", proposedBy: "agent" }, NOW), NOW),
    ]
    expect(openDecisions(list).map((d) => d.id)).toEqual(["a"])
    expect(openDecisionCount(list)).toBe(1)
  })
})

describe("annotations", () => {
  it("dismiss / convert only act on active annotations", () => {
    const a = proposeAnnotation({ id: "a1", anchor: "p1", kind: "flag", body: "b", author: "agent" }, NOW)
    expect(a.status).toBe("active")
    const dismissed = dismissAnnotation(a, "not relevant", 2_000)
    expect(dismissed.status).toBe("dismissed")
    expect(dismissed.resolutionNote).toBe("not relevant")
    // converting an already-dismissed one is a no-op
    expect(convertAnnotation(dismissed, "x", 3_000)).toBe(dismissed)
    expect(convertAnnotation(a, "promoted", 3_000).status).toBe("converted")
  })

  it("findOrphanAnnotations returns active annotations whose anchor no longer resolves", () => {
    const list: Annotation<string>[] = [
      proposeAnnotation<string>({ id: "keep", anchor: "p1", kind: "note", body: "b", author: "human" }, NOW),
      proposeAnnotation<string>({ id: "orphan", anchor: null, kind: "flag", body: "b", author: "agent" }, NOW),
      dismissAnnotation(proposeAnnotation<string>({ id: "dead", anchor: null, kind: "flag", body: "b", author: "agent" }, NOW), undefined, NOW),
    ]
    expect(findOrphanAnnotations(list).map((a) => a.id)).toEqual(["orphan"])
  })
})

describe("acceptance", () => {
  const full = [
    { id: "c1", label: "renders", checked: true },
    { id: "c2", label: "no console errors", checked: true },
  ]
  const partial = [
    { id: "c1", label: "renders", checked: true },
    { id: "c2", label: "no console errors", checked: false },
  ]

  it("acceptanceComplete requires every check ticked (and a non-empty list)", () => {
    expect(acceptanceComplete(full)).toBe(true)
    expect(acceptanceComplete(partial)).toBe(false)
    expect(acceptanceComplete([])).toBe(false)
  })

  it("makeAcceptanceReceipt returns a receipt only when complete", () => {
    expect(makeAcceptanceReceipt({ ref: "doc1", reviewer: "dr", checklist: partial }, NOW)).toBeNull()
    const receipt = makeAcceptanceReceipt({ ref: "doc1", reviewer: "dr", checklist: full }, NOW)
    expect(receipt).not.toBeNull()
    expect(receipt?.reviewer).toBe("dr")
    expect(receipt?.acceptedMs).toBe(NOW)
  })
})
