// Adjudication state for ComparePanel. resolveCandidateState is the single
// definition shared by the render path and these tests — locking it here locks
// the open/pending/resolved transitions the brief requires.

import { describe, expect, it } from "vitest"

import { resolveCandidateState } from "./compare-panel"

describe("resolveCandidateState — open", () => {
  it("is open when no pending or accepted id is set", () => {
    expect(resolveCandidateState("a")).toBe("open")
    expect(resolveCandidateState("a", null, null)).toBe("open")
  })

  it("is open for every candidate id when nothing is pending/resolved", () => {
    expect(resolveCandidateState("a")).toBe("open")
    expect(resolveCandidateState("b")).toBe("open")
    expect(resolveCandidateState("c")).toBe("open")
  })
})

describe("resolveCandidateState — pending", () => {
  it("is pending for EVERY candidate while a mutation is in flight", () => {
    expect(resolveCandidateState("a", "b")).toBe("pending")
    expect(resolveCandidateState("b", "b")).toBe("pending")
    expect(resolveCandidateState("c", "b")).toBe("pending")
  })
})

describe("resolveCandidateState — resolved", () => {
  it("marks the accepted candidate as accepted", () => {
    expect(resolveCandidateState("b", null, "b")).toBe("accepted")
  })

  it("marks every other candidate as rejected once one is accepted", () => {
    expect(resolveCandidateState("a", null, "b")).toBe("rejected")
    expect(resolveCandidateState("c", null, "b")).toBe("rejected")
  })

  it("resolved wins over pending (a finalized accept is not still pending)", () => {
    expect(resolveCandidateState("b", "b", "b")).toBe("accepted")
    expect(resolveCandidateState("a", "b", "b")).toBe("rejected")
  })
})
