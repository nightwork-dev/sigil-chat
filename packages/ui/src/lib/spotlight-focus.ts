// Pure geometry + focus-order math behind <SpotlightScrim>. Kept out of the
// component so the a11y-critical contract (tab order inside the spotlit
// region, dismiss-key detection, cutout/clip-path geometry) is locked down in
// node/jsdom tests, matching the repo's extract-the-math convention (see
// lib/minimap.ts for the sibling pattern).

export interface RectLike {
  top: number
  left: number
  width: number
  height: number
}

export interface Cutout {
  x: number
  y: number
  w: number
  h: number
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
  "[contenteditable=true]",
].join(",")

// Deliberately a plain `boolean`, not a `el is HTMLElement` type predicate:
// every real call site passes an already-`HTMLElement`-typed value, and a
// same-type predicate's negated branch narrows to `never` there (TS 4.4+
// aliased-condition tracking follows the guard through a stored boolean, so
// even `const ok = isFocusable(x); if (!ok)` hits it) — a real footgun, not
// a style nit.
/** Whether `el` itself is a legitimate Tab stop (ignores disabled/-1/aria-hidden). */
export function isFocusable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.getAttribute("aria-hidden") === "true") return false
  if (el.hasAttribute("disabled")) return false
  const tabIndexAttr = el.getAttribute("tabindex")
  if (tabIndexAttr !== null && Number(tabIndexAttr) < 0) return false
  return el.matches(FOCUSABLE_SELECTOR)
}

/**
 * Every Tab stop inside the spotlit region, in DOM (= visual/reading) order.
 * The target itself is included first when it is focusable — a spotlit
 * element that is itself a button/link stays reachable, not just its
 * children.
 */
export function collectFocusables(target: HTMLElement): HTMLElement[] {
  const descendants = Array.from(target.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el): el is HTMLElement => isFocusable(el))
  return isFocusable(target) ? [target, ...descendants] : descendants
}

/**
 * Wraps Tab/Shift+Tab within `focusables`. Returns null when there is
 * nothing to focus (caller should fall back to the container itself).
 */
export function resolveTabTarget(current: Element | null, focusables: HTMLElement[], direction: 1 | -1): HTMLElement | null {
  if (focusables.length === 0) return null
  const index = current ? focusables.indexOf(current as HTMLElement) : -1
  if (index === -1) return direction === 1 ? focusables[0]! : focusables[focusables.length - 1]!
  const next = index + direction
  if (next < 0) return focusables[focusables.length - 1]!
  if (next >= focusables.length) return focusables[0]!
  return focusables[next]!
}

/** Escape is the only dismiss key — scrim-tap dismiss is a separate (pointer) path. */
export function isDismissKey(event: Pick<KeyboardEvent, "key">): boolean {
  return event.key === "Escape"
}

/** Focuses `el` if it is still attached to the document; no-op (never throws) otherwise. */
export function restoreFocus(el: HTMLElement | null): void {
  if (el && document.contains(el)) {
    el.focus({ preventScroll: true })
  }
}

/**
 * The padded cutout rect in viewport (`fixed`-positioned) coordinates.
 * `viewportWidth` is a parameter (not read from `window` here) so the math
 * stays pure and testable without a real layout.
 */
export function computeCutout(rect: RectLike, padding: number, viewportWidth: number): Cutout {
  const x = Math.max(0, rect.left - padding)
  const y = Math.max(0, rect.top - padding)
  const w = Math.min(viewportWidth - x, rect.width + padding * 2)
  const h = rect.height + padding * 2
  return { x, y, w, h }
}

/**
 * A full-viewport polygon with the cutout's rounded corners carved out.
 * Applied to the dimmer layer via `clip-path`: the browser excludes the
 * carved region from both paint AND hit-testing, which is what makes
 * scrim-tap-to-dismiss "just work" without a second full-screen element.
 */
export function buildScrimClipPath({ x, y, w, h }: Cutout, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  // Self-intersecting "keyhole" path: trace the full viewport, then bridge
  // straight into the cutout's rounded rect and back out along the same
  // seam. This is the same technique the reference uses — no fill-rule
  // keyword needed (clip-path polygon fill-rule support is inconsistent).
  return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ` +
    `${x}px ${y + r}px, ` +
    `${x}px ${y + h - r}px, ` +
    `${x + r}px ${y + h}px, ` +
    `${x + w - r}px ${y + h}px, ` +
    `${x + w}px ${y + h - r}px, ` +
    `${x + w}px ${y + r}px, ` +
    `${x + w - r}px ${y}px, ` +
    `${x + r}px ${y}px, ` +
    `${x}px ${y + r}px)`
}
