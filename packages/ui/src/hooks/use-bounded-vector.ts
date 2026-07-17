// useBoundedVector — Layer 2 headless interaction core.
//
// Owns pointer-drag and keyboard state for N bounded numeric axes (sliders,
// XY pads, knobs). CONTROLLED-ONLY: `value` is a prop, `onChange` fires the
// next value out. The hook holds NO internal value state — only ephemeral
// drag-session state (drag-start value, drag origin, dragging flag).
//
// All math (clamp / snapToStep / denormalize) is imported from
// @workspace/ui/lib/interaction; nothing numeric is reimplemented inline.
//
// Spec: the interaction-cores design spec (Layer 2).

import * as React from "react"

import { clamp, denormalize, snapToStep } from "@workspace/ui/lib/interaction"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AxisConfig {
  /** Lower bound. Defaults to 0. */
  min?: number
  /** Upper bound. Defaults to 1. */
  max?: number
  /** Optional quantization; values snap to multiples of `step` measured from `min`. */
  step?: number
}

export type BoundedVectorMapping =
  /** Pointer POSITION over the element rect projects to value. */
  | { mode: "absolute"; orientation: "x" | "y" | "xy"; invertY?: boolean }
  /** Pointer DELTA from drag start scales into value units. */
  | {
      mode: "relative"
      axis: "x" | "y"
      /** Full-range px (150 ⇒ a 150px drag sweeps min→max). */
      pixelsPerUnit: number
      invert?: boolean
    }

export interface UseBoundedVectorOptions {
  /** One config per axis. length = N. */
  axes: AxisConfig[]
  /** Controlled value, length = N. */
  value: number[]
  /** Fires with the next (already clamped + snapped) value during drag / keys. */
  onChange: (next: number[]) => void
  /** Fires once on pointer-up / cancel / blur settle, and once per keypress. */
  onCommit?: (v: number[]) => void
  mapping: BoundedVectorMapping
  disabled?: boolean
}

export interface UseBoundedVectorReturn {
  /**
   * Spread onto the interactive element. Uses setPointerCapture; the captured
   * pointer feeds the element's own onPointerMove/Up/Cancel, and window-level
   * pointerup / pointercancel / blur backups guarantee no stuck-drag state.
   * (No document-level mousemove/mouseup listeners — pointer capture only.)
   */
  targetProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
    tabIndex: number
    role: "slider"
    "aria-valuemin": number
    "aria-valuemax": number
    "aria-valuenow": number
    "aria-disabled"?: boolean
    "aria-orientation"?: "horizontal" | "vertical"
    /**
     * touchAction: "none" always — without it, mobile page scroll hijacks
     * the drag (browser fires pointercancel and scrolls instead). userSelect
     * is "none" only while dragging, to block text selection / iOS
     * long-press callout (interaction-cores spec, Amendment v1.1).
     */
    style: React.CSSProperties
  }
  dragging: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers — no closure state, take everything as args
// ---------------------------------------------------------------------------

function axisMin(a?: AxisConfig): number {
  return a?.min ?? 0
}
function axisMax(a?: AxisConfig): number {
  return a?.max ?? 1
}
function axisStep(a?: AxisConfig): number | undefined {
  return a?.step
}

/** Clamp + snap every axis. Called on EVERY emission (drag move, keypress). */
function sanitize(next: number[], axes: AxisConfig[]): number[] {
  return next.map((v, i) => {
    const min = axisMin(axes[i])
    const max = axisMax(axes[i])
    const clamped = clamp(v, min, max)
    const step = axisStep(axes[i])
    return step !== undefined ? snapToStep(clamped, step, min) : clamped
  })
}

/** Arrow-key increment: explicit `step`, else 1% of the axis range. */
function arrowStep(a: AxisConfig): number {
  const step = axisStep(a)
  if (step !== undefined) return step
  return 0.01 * (axisMax(a) - axisMin(a))
}

/** Page-key increment: always 10% of the axis range (never step-based). */
function pageStep(a: AxisConfig): number {
  return 0.1 * (axisMax(a) - axisMin(a))
}

type AbsoluteMapping = Extract<BoundedVectorMapping, { mode: "absolute" }>
type RelativeMapping = Extract<BoundedVectorMapping, { mode: "relative" }>

/** Absolute mode: project pointer position over the rect into value space. */
function computeAbsoluteNext(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  value: number[],
  axes: AxisConfig[],
  mapping: AbsoluteMapping,
): number[] {
  const next = value.slice()
  if (mapping.orientation === "x") {
    const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    next[0] = denormalize(t, axisMin(axes[0]), axisMax(axes[0]))
  } else if (mapping.orientation === "y") {
    let t = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
    if (mapping.invertY) t = 1 - t
    next[0] = denormalize(t, axisMin(axes[0]), axisMax(axes[0]))
  } else {
    // "xy" — axis 0 from horizontal position, axis 1 from vertical position.
    const tx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    let ty = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
    if (mapping.invertY) ty = 1 - ty
    next[0] = denormalize(tx, axisMin(axes[0]), axisMax(axes[0]))
    if (axes.length >= 2) {
      next[1] = denormalize(ty, axisMin(axes[1]), axisMax(axes[1]))
    }
  }
  return next
}

/** Relative mode: scale cumulative pointer delta (from drag start) into value units. */
function computeRelativeNext(
  deltaPxX: number,
  deltaPxY: number,
  startValue: number[],
  axes: AxisConfig[],
  mapping: RelativeMapping,
): number[] {
  const next = startValue.slice()
  const ppu = mapping.pixelsPerUnit
  const raw = mapping.axis === "x" ? deltaPxX : deltaPxY
  let delta = ppu > 0 ? raw / ppu : 0
  if (mapping.invert) delta = -delta
  const range = axisMax(axes[0]) - axisMin(axes[0])
  next[0] = startValue[0] + delta * range
  return next
}

/** aria-orientation is emitted only for 1-D mappings (axes.length === 1). */
function computeAriaOrientation(
  mapping: BoundedVectorMapping,
  axisCount: number,
): "horizontal" | "vertical" | undefined {
  if (axisCount !== 1) return undefined
  if (mapping.mode === "absolute") {
    if (mapping.orientation === "x") return "horizontal"
    if (mapping.orientation === "y") return "vertical"
    return undefined // "xy" misconfigured with a single axis
  }
  return mapping.axis === "x" ? "horizontal" : "vertical"
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBoundedVector(
  options: UseBoundedVectorOptions,
): UseBoundedVectorReturn {
  const { axes, value, onChange, onCommit, mapping, disabled = false } = options

  // `dragging` is UI/session state (NOT the controlled value), so useState is
  // legitimate here — the hook never holds the value itself.
  const [dragging, setDragging] = React.useState(false)
  const draggingRef = React.useRef(false)

  // Ephemeral drag-session state.
  const pointerIdRef = React.useRef<number | null>(null)
  const startPointerRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const startValueRef = React.useRef<number[]>([])

  // Latest-prop mirrors so the stable endDrag + window listeners never close
  // over a stale value / onCommit.
  const valueRef = React.useRef(value)
  valueRef.current = value
  const onCommitRef = React.useRef(onCommit)
  onCommitRef.current = onCommit

  // Stable drag-end: reads refs only, so [] deps are correct. Idempotent —
  // safe to call from both the element handler and the window backups.
  const endDrag = React.useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const commit = onCommitRef.current
    if (commit) commit(valueRef.current.slice())
  }, [])

  // Window-level POINTER backups (registered only while dragging). These are
  // pointer events, NOT document mousemove/mouseup — they exist purely so a
  // drag can't get stuck if the element is removed or loses capture mid-drag,
  // and so a window blur ends the drag cleanly. All removed on unmount.
  React.useEffect(() => {
    if (!dragging) return
    const endIfOurs = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
      endDrag()
    }
    const onWinBlur = () => endDrag()
    window.addEventListener("pointerup", endIfOurs)
    window.addEventListener("pointercancel", endIfOurs)
    window.addEventListener("blur", onWinBlur)
    return () => {
      window.removeEventListener("pointerup", endIfOurs)
      window.removeEventListener("pointercancel", endIfOurs)
      window.removeEventListener("blur", onWinBlur)
    }
  }, [dragging, endDrag])

  // --- pointer handlers (recreated each render → always close over the
  //     fresh controlled value / axes / mapping / onChange) ---

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return
    if (e.pointerType === "mouse" && e.button !== 0) return
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already released or element detached — degrade; the drag still
      // tracks while the pointer remains over the element.
    }
    pointerIdRef.current = e.pointerId
    startPointerRef.current = { x: e.clientX, y: e.clientY }
    startValueRef.current = value.slice()
    draggingRef.current = true
    setDragging(true)

    if (mapping.mode === "absolute") {
      // Click-to-jump: compute from the initial pointer position immediately.
      const rect = target.getBoundingClientRect()
      const next = computeAbsoluteNext(e.clientX, e.clientY, rect, value, axes, mapping)
      onChange(sanitize(next, axes))
    }
    // Relative mode: no jump — value derives from start as the pointer travels.
  }

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
    if (mapping.mode === "absolute") {
      const rect = e.currentTarget.getBoundingClientRect()
      const next = computeAbsoluteNext(e.clientX, e.clientY, rect, value, axes, mapping)
      onChange(sanitize(next, axes))
    } else {
      const dx = e.clientX - startPointerRef.current.x
      const dy = e.clientY - startPointerRef.current.y
      const next = computeRelativeNext(dx, dy, startValueRef.current, axes, mapping)
      onChange(sanitize(next, axes))
    }
  }

  const releaseAndEnd = (e: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Already released or detached — nothing to release.
    }
    endDrag()
  }

  // --- keyboard: each keypress is its own committed step (onChange + onCommit) ---

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return
    const isXY = axes.length === 2

    let idx = -1
    let delta: number | null = null
    let setTo: number | null = null

    switch (e.key) {
      case "ArrowRight":
        idx = 0
        delta = +arrowStep(axes[0])
        break
      case "ArrowLeft":
        idx = 0
        delta = -arrowStep(axes[0])
        break
      case "ArrowUp": {
        const i = isXY ? 1 : 0
        idx = i
        delta = +arrowStep(axes[i])
        break
      }
      case "ArrowDown": {
        const i = isXY ? 1 : 0
        idx = i
        delta = -arrowStep(axes[i])
        break
      }
      case "PageUp":
        // 2-axis spec ambiguity (see summary) — applied to axis 0.
        idx = 0
        delta = +pageStep(axes[0])
        break
      case "PageDown":
        idx = 0
        delta = -pageStep(axes[0])
        break
      case "Home":
        idx = 0
        setTo = axisMin(axes[0])
        break
      case "End":
        idx = 0
        setTo = axisMax(axes[0])
        break
      default:
        return
    }

    e.preventDefault()

    const next = value.slice()
    if (delta !== null) {
      next[idx] = value[idx] + delta
    } else if (setTo !== null) {
      next[idx] = setTo
    }
    const sanitized = sanitize(next, axes)
    onChange(sanitized)
    if (onCommit) onCommit(sanitized)
  }

  // --- targetProps (ARIA surface reflects axis 0) ---

  const ariaOrientation = computeAriaOrientation(mapping, axes.length)

  const targetProps: UseBoundedVectorReturn["targetProps"] = {
    onPointerDown,
    onPointerMove,
    onPointerUp: releaseAndEnd,
    onPointerCancel: releaseAndEnd,
    onKeyDown,
    tabIndex: disabled ? -1 : 0,
    role: "slider",
    "aria-valuemin": axisMin(axes[0]),
    "aria-valuemax": axisMax(axes[0]),
    "aria-valuenow": value[0],
    style: {
      touchAction: "none",
      ...(dragging ? { userSelect: "none" as const } : {}),
    },
  }
  if (disabled) {
    targetProps["aria-disabled"] = true // omitted (not false) when enabled
  }
  if (ariaOrientation) {
    targetProps["aria-orientation"] = ariaOrientation
  }

  return { targetProps, dragging }
}
