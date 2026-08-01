import { describe, expect, it } from "vitest"

import type { Story } from "@workspace/work-items-store/types"

import {
  ownerPassComment,
  selectVerificationQueue,
  verificationTarget,
} from "./verification-queue"

function story(overrides: Partial<Story> & Pick<Story, "id">): Story {
  return {
    kind: "story",
    homeScopeId: "installation:default",
    scopeBindings: [],
    provenance: {
      origin: "principal",
      actorPrincipalId: "principal:owner",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    revision: 1,
    epicId: "epic",
    epicTitle: "Epic",
    title: `Story ${overrides.id}`,
    intent: "Intent.",
    acceptanceCriteria: [],
    status: "verify",
    routing: "implementation",
    reviewGate: "browser:owner",
    deps: [],
    authoredBy: "Vesper",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("selectVerificationQueue", () => {
  it("keeps only verify-status stories", () => {
    const queue = selectVerificationQueue([
      story({ id: "A" }),
      story({ id: "B", status: "shipped" }),
      story({ id: "C", status: "in-progress" }),
      story({ id: "D", status: "blocked" }),
    ])
    expect(queue.map((entry) => entry.story.id)).toEqual(["A"])
  })

  it("orders newest-first by updatedAt, breaking ties on id", () => {
    const queue = selectVerificationQueue([
      story({ id: "OLD", updatedAt: "2026-07-01T00:00:00.000Z" }),
      story({ id: "NEW", updatedAt: "2026-08-01T12:00:00.000Z" }),
      story({ id: "MID.1", updatedAt: "2026-07-20T00:00:00.000Z" }),
      story({ id: "MID.2", updatedAt: "2026-07-20T00:00:00.000Z" }),
    ])
    expect(queue.map((entry) => entry.story.id)).toEqual([
      "NEW",
      "MID.2",
      "MID.1",
      "OLD",
    ])
  })

  it("does not mutate the array it was handed", () => {
    const stories = [
      story({ id: "OLD", updatedAt: "2026-07-01T00:00:00.000Z" }),
      story({ id: "NEW", updatedAt: "2026-08-01T00:00:00.000Z" }),
    ]
    selectVerificationQueue(stories)
    expect(stories.map((item) => item.id)).toEqual(["OLD", "NEW"])
  })

  it("carries the authored steps and marks the row targeted", () => {
    const [entry] = selectVerificationQueue([
      story({
        id: "MDL.2",
        verify: {
          url: "/settings?section=models",
          steps: ["Open Settings.", "Toggle a model."],
        },
      }),
    ])
    expect(entry.href).toBe("/settings?section=models")
    expect(entry.steps).toEqual(["Open Settings.", "Toggle a model."])
    expect(entry.targeted).toBe(true)
  })

  it("falls back to the story's roadmap panel when no block is authored", () => {
    const [entry] = selectVerificationQueue([story({ id: "SC.17" })])
    expect(entry.href).toBe("/roadmap?story=SC.17")
    expect(entry.steps).toEqual([])
    expect(entry.targeted).toBe(false)
  })
})

describe("verificationTarget", () => {
  it("preserves an in-app path with search params", () => {
    expect(
      verificationTarget(
        story({
          id: "FLAG.1",
          verify: { url: "/settings?section=flags", steps: [] },
        }),
      ),
    ).toBe("/settings?section=flags")
  })

  // `verify.url` is hand-authored YAML in a file outside this repo, so it is
  // untrusted input on the same footing as a `returnTo` search param.
  it("refuses an off-origin target and falls back to the story panel", () => {
    for (const url of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "\\/evil.example",
      "javascript:alert(1)",
    ]) {
      expect(
        verificationTarget(story({ id: "X.1", verify: { url, steps: [] } })),
        url,
      ).toBe("/roadmap?story=X.1")
    }
  })
})

describe("ownerPassComment", () => {
  it("records the pass with its ISO timestamp", () => {
    const body = ownerPassComment("2026-08-01T23:45:00.000Z")
    expect(body).toContain("2026-08-01T23:45:00.000Z")
    expect(body).toContain("Owner verification pass")
  })
})
