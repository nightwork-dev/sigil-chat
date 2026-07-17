/** @vitest-environment jsdom */
// jsdom is scoped to this file only (default project environment stays
// "node" for the rest of the lib/scripts suites — see vitest.config.ts).

import { beforeEach, describe, expect, it } from "vitest"

import {
  buildScrimClipPath,
  collectFocusables,
  computeCutout,
  isDismissKey,
  isFocusable,
  resolveTabTarget,
  restoreFocus,
} from "./spotlight-focus"

describe("isFocusable", () => {
  it("accepts native interactive elements", () => {
    expect(isFocusable(document.createElement("button"))).toBe(true)
    const a = document.createElement("a")
    a.href = "#x"
    expect(isFocusable(a)).toBe(true)
  })
  it("rejects disabled elements", () => {
    const btn = document.createElement("button")
    btn.disabled = true
    expect(isFocusable(btn)).toBe(false)
  })
  it("rejects tabindex=-1 and aria-hidden", () => {
    const div = document.createElement("div")
    div.tabIndex = -1
    expect(isFocusable(div)).toBe(false)

    const hidden = document.createElement("button")
    hidden.setAttribute("aria-hidden", "true")
    expect(isFocusable(hidden)).toBe(false)
  })
  it("rejects a non-interactive element with no tabindex", () => {
    expect(isFocusable(document.createElement("span"))).toBe(false)
  })
})

describe("collectFocusables", () => {
  it("includes the target first when the target itself is focusable", () => {
    const target = document.createElement("button")
    target.innerHTML = '<a href="#a">a</a><a href="#b">b</a>'
    const out = collectFocusables(target)
    expect(out).toEqual([target, target.querySelector('a[href="#a"]'), target.querySelector('a[href="#b"]')])
  })
  it("returns only descendants when the target itself is not focusable", () => {
    const target = document.createElement("div")
    target.innerHTML = '<button id="a">a</button><span>not focusable</span><button id="b">b</button>'
    const out = collectFocusables(target)
    expect(out.map((el) => el.id)).toEqual(["a", "b"])
  })
  it("returns an empty array for a region with nothing focusable", () => {
    const target = document.createElement("div")
    target.innerHTML = "<p>plain text</p>"
    expect(collectFocusables(target)).toEqual([])
  })
})

describe("resolveTabTarget", () => {
  let focusables: HTMLElement[]
  beforeEach(() => {
    focusables = ["a", "b", "c"].map((id) => {
      const el = document.createElement("button")
      el.id = id
      return el
    })
  })

  it("returns null when there is nothing focusable", () => {
    expect(resolveTabTarget(null, [], 1)).toBeNull()
  })
  it("moves forward within bounds", () => {
    expect(resolveTabTarget(focusables[0]!, focusables, 1)?.id).toBe("b")
  })
  it("moves backward within bounds", () => {
    expect(resolveTabTarget(focusables[1]!, focusables, -1)?.id).toBe("a")
  })
  it("wraps forward past the last focusable back to the first", () => {
    expect(resolveTabTarget(focusables[2]!, focusables, 1)?.id).toBe("a")
  })
  it("wraps backward past the first focusable to the last", () => {
    expect(resolveTabTarget(focusables[0]!, focusables, -1)?.id).toBe("c")
  })
  it("treats an unknown/stale current as 'before the start' for forward Tab", () => {
    const stray = document.createElement("button")
    expect(resolveTabTarget(stray, focusables, 1)?.id).toBe("a")
  })
  it("treats an unknown/stale current as 'after the end' for backward Tab", () => {
    const stray = document.createElement("button")
    expect(resolveTabTarget(stray, focusables, -1)?.id).toBe("c")
  })
})

describe("isDismissKey", () => {
  it("is true only for Escape", () => {
    expect(isDismissKey({ key: "Escape" })).toBe(true)
    expect(isDismissKey({ key: "Enter" })).toBe(false)
    expect(isDismissKey({ key: "Tab" })).toBe(false)
    expect(isDismissKey({ key: "a" })).toBe(false)
  })
})

describe("restoreFocus — dismissal restores prior focus", () => {
  it("focuses the element when it is still attached to the document", () => {
    const btn = document.createElement("button")
    document.body.appendChild(btn)
    // jsdom starts with document.body focused; move focus elsewhere first
    // so we can prove restoreFocus actually changed it, not left it as-is.
    const other = document.createElement("button")
    document.body.appendChild(other)
    other.focus()
    expect(document.activeElement).toBe(other)

    restoreFocus(btn)
    expect(document.activeElement).toBe(btn)

    document.body.removeChild(btn)
    document.body.removeChild(other)
  })
  it("is a no-op (never throws) when the element was removed from the document", () => {
    const detached = document.createElement("button")
    document.body.appendChild(detached)
    document.body.removeChild(detached)
    expect(() => restoreFocus(detached)).not.toThrow()
    expect(document.activeElement).not.toBe(detached)
  })
  it("is a no-op for null", () => {
    expect(() => restoreFocus(null)).not.toThrow()
  })
})

describe("computeCutout", () => {
  it("pads the rect symmetrically when there is room", () => {
    const cutout = computeCutout({ top: 100, left: 100, width: 50, height: 20 }, 12, 1024)
    expect(cutout).toEqual({ x: 88, y: 88, w: 74, h: 44 })
  })
  it("clamps the left/top edge at 0 instead of going negative", () => {
    const cutout = computeCutout({ top: 4, left: 4, width: 50, height: 20 }, 12, 1024)
    expect(cutout.x).toBe(0)
    expect(cutout.y).toBe(0)
  })
  it("clamps width so the cutout never extends past the viewport", () => {
    const cutout = computeCutout({ top: 10, left: 900, width: 200, height: 20 }, 12, 1024)
    expect(cutout.x).toBe(888)
    expect(cutout.w).toBe(1024 - 888)
  })
})

describe("buildScrimClipPath", () => {
  it("produces a polygon() clip-path string", () => {
    const path = buildScrimClipPath({ x: 10, y: 10, w: 40, h: 20 }, 6)
    expect(path.startsWith("polygon(")).toBe(true)
    expect(path.endsWith(")")).toBe(true)
    expect(path).toContain("10px")
  })
  it("clamps the radius so it never exceeds half the cutout's smaller dimension", () => {
    // radius 50 on a 40x20 cutout would produce an invalid (crossing) path
    // if left unclamped; the builder caps it at h/2 = 10.
    const path = buildScrimClipPath({ x: 0, y: 0, w: 40, h: 20 }, 50)
    expect(path).toContain("10px")
    expect(path).not.toContain("50px")
  })
})
