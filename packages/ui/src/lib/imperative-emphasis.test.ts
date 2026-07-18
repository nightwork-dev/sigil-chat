/** @vitest-environment jsdom */
// jsdom is scoped to this file only (default project environment stays
// "node" for the rest of the lib suite — see vitest.config.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_EMPHASIS_DURATION_MS,
  EmphasisEngine,
  MAX_EMPHASIS_DURATION_MS,
  MIN_EMPHASIS_DURATION_MS,
  getEmphasisTargetProps,
  isEmphasisCommand,
  normalizeEmphasisCommand,
} from "./imperative-emphasis"

function target(id: string): HTMLElement {
  const el = document.createElement("div")
  el.setAttribute("data-emphasis-target", id)
  document.body.appendChild(el)
  return el
}

describe("normalizeEmphasisCommand", () => {
  it("dedupes target ids", () => {
    const normalized = normalizeEmphasisCommand({
      targetIds: ["a", "b", "a"],
      effect: "focus",
    })
    expect(normalized.targetIds).toEqual(["a", "b"])
  })

  it("defaults duration and scroll", () => {
    const normalized = normalizeEmphasisCommand({ targetIds: ["a"], effect: "pulse" })
    expect(normalized.durationMs).toBe(DEFAULT_EMPHASIS_DURATION_MS)
    expect(normalized.scroll).toBe("nearest")
  })

  it("clamps durationMs below the minimum up to 300ms", () => {
    expect(
      normalizeEmphasisCommand({ targetIds: ["a"], effect: "focus", durationMs: 10 })
        .durationMs,
    ).toBe(MIN_EMPHASIS_DURATION_MS)
  })

  it("clamps durationMs above the maximum down to 10s", () => {
    expect(
      normalizeEmphasisCommand({
        targetIds: ["a"],
        effect: "focus",
        durationMs: 999_999,
      }).durationMs,
    ).toBe(MAX_EMPHASIS_DURATION_MS)
  })

  it("passes through an in-range durationMs and explicit scroll", () => {
    const normalized = normalizeEmphasisCommand({
      targetIds: ["a"],
      effect: "trace",
      durationMs: 1200,
      scroll: "center",
    })
    expect(normalized.durationMs).toBe(1200)
    expect(normalized.scroll).toBe("center")
  })
})

describe("isEmphasisCommand", () => {
  it("rejects an empty or oversized targetIds array", () => {
    expect(isEmphasisCommand({ targetIds: [], effect: "focus" })).toBe(false)
    expect(
      isEmphasisCommand({
        targetIds: Array.from({ length: 51 }, (_, i) => `t${i}`),
        effect: "focus",
      }),
    ).toBe(false)
  })

  it("rejects an unknown effect", () => {
    expect(isEmphasisCommand({ targetIds: ["a"], effect: "glow" })).toBe(false)
  })

  it("rejects an invalid target id", () => {
    expect(isEmphasisCommand({ targetIds: ["bad id!"], effect: "focus" })).toBe(false)
  })

  it("accepts a minimal valid command", () => {
    expect(isEmphasisCommand({ targetIds: ["a.b:c-d_e/f"], effect: "dim-others" })).toBe(
      true,
    )
  })
})

describe("getEmphasisTargetProps", () => {
  it("throws on an invalid id", () => {
    expect(() => getEmphasisTargetProps("bad id!")).toThrow()
  })

  it("returns the configured attribute keyed by the id", () => {
    expect(getEmphasisTargetProps("panel-1")).toEqual({
      "data-emphasis-target": "panel-1",
    })
    expect(getEmphasisTargetProps("panel-1", "data-agent-target")).toEqual({
      "data-agent-target": "panel-1",
    })
  })
})

describe("EmphasisEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
    document.documentElement.removeAttribute("data-emphasis-dimming")
  })

  it("toggles active + effect attributes on matched targets and clears them after the clamped duration", () => {
    const engine = new EmphasisEngine()
    const el = target("a")

    engine.applyCommands([{ targetIds: ["a"], effect: "pulse", durationMs: 500 }], true)

    expect(el.getAttribute("data-emphasis-active")).toBe("true")
    expect(el.getAttribute("data-emphasis-effect")).toBe("pulse")

    vi.advanceTimersByTime(499)
    expect(el.getAttribute("data-emphasis-active")).toBe("true")

    vi.advanceTimersByTime(1)
    expect(el.hasAttribute("data-emphasis-active")).toBe(false)
    expect(el.hasAttribute("data-emphasis-effect")).toBe(false)
  })

  it("clamps an out-of-range duration before scheduling the self-expiring timer", () => {
    const engine = new EmphasisEngine()
    const el = target("a")

    engine.applyCommands([{ targetIds: ["a"], effect: "focus", durationMs: 1 }], true)

    // Below MIN_EMPHASIS_DURATION_MS: must not have expired yet just before it.
    vi.advanceTimersByTime(MIN_EMPHASIS_DURATION_MS - 1)
    expect(el.getAttribute("data-emphasis-active")).toBe("true")

    vi.advanceTimersByTime(1)
    expect(el.hasAttribute("data-emphasis-active")).toBe(false)
  })

  it("merges effects from overlapping applications onto a shared target", () => {
    const engine = new EmphasisEngine()
    const el = target("a")

    engine.applyCommands(
      [
        { targetIds: ["a"], effect: "focus", durationMs: 1000 },
        { targetIds: ["a"], effect: "pulse", durationMs: 5000 },
      ],
      true,
    )

    expect(el.getAttribute("data-emphasis-effect")).toBe("focus pulse")

    vi.advanceTimersByTime(1000)
    expect(el.getAttribute("data-emphasis-effect")).toBe("pulse")
  })

  it("sets the dimming attribute on the document root while dim-others is active, and clears it once it expires", () => {
    const engine = new EmphasisEngine()
    target("a")

    engine.applyCommands([{ targetIds: ["a"], effect: "dim-others", durationMs: 500 }], true)
    expect(document.documentElement.getAttribute("data-emphasis-dimming")).toBe("true")

    vi.advanceTimersByTime(500)
    expect(document.documentElement.hasAttribute("data-emphasis-dimming")).toBe(false)
  })

  it("clear() cancels pending timers and strips attributes immediately", () => {
    const engine = new EmphasisEngine()
    const el = target("a")

    engine.applyCommands([{ targetIds: ["a"], effect: "trace", durationMs: 5000 }], true)
    expect(el.getAttribute("data-emphasis-active")).toBe("true")

    engine.clear()
    expect(el.hasAttribute("data-emphasis-active")).toBe(false)

    // The cancelled timeout must not fire later and throw/act on stale state.
    vi.advanceTimersByTime(5000)
    expect(el.hasAttribute("data-emphasis-active")).toBe(false)
  })

  it("clearPrevious=false layers a new application without clearing the running one", () => {
    const engine = new EmphasisEngine()
    const a = target("a")
    const b = target("b")

    engine.applyCommands([{ targetIds: ["a"], effect: "focus", durationMs: 5000 }], true)
    engine.applyCommands([{ targetIds: ["b"], effect: "pulse", durationMs: 5000 }], false)

    expect(a.getAttribute("data-emphasis-active")).toBe("true")
    expect(b.getAttribute("data-emphasis-active")).toBe("true")
  })

  it("silently skips a command with no matching targets and an invalid command", () => {
    const engine = new EmphasisEngine()
    const scroll = engine.applyCommands(
      [
        { targetIds: ["missing"], effect: "focus" },
        { targetIds: [], effect: "focus" } as unknown as Parameters<
          typeof engine.applyCommands
        >[0][number],
      ],
      true,
    )
    expect(scroll).toBeUndefined()
  })

  it("respects a configured targetAttribute instead of the default", () => {
    const engine = new EmphasisEngine({ targetAttribute: "data-agent-target" })
    const el = document.createElement("div")
    el.setAttribute("data-agent-target", "a")
    document.body.appendChild(el)

    engine.applyCommands([{ targetIds: ["a"], effect: "focus", durationMs: 500 }], true)
    expect(el.getAttribute("data-emphasis-active")).toBe("true")
  })
})
