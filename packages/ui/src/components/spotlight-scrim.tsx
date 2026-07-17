"use client"

// Dim everything except one element — the mobile-annotation focus pattern.
// An SVG mask + a clip-path'd dimmer layer carve a rounded cutout around a
// caller-supplied target, rAF-tracked so the cutout follows the target
// through scroll/resize/layout without a second render pass (see
// lib/spotlight-focus.ts for the pure geometry). Focus moves into the
// spotlit region on mount, is trapped there, and is restored to whatever was
// focused before on dismiss (ESC, scrim-tap, or a caller-triggered
// `onDismiss`).
//
// Flat (not compound Root/Parts): a spotlight is one shape with one caller
// contract, not independently composable parts — the RULE 1 exception for
// single-shape surfaces (compare the reference `Meter`/`DocumentMinimap`).

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  buildScrimClipPath,
  collectFocusables,
  computeCutout,
  isDismissKey,
  isFocusable,
  resolveTabTarget,
  restoreFocus,
  type Cutout,
} from "@workspace/ui/lib/spotlight-focus"

export interface SpotlightScrimProps {
  /** The element to spotlight. Re-measured every frame (rAF), so it may move/resize/scroll freely. */
  targetRef?: RefObject<HTMLElement | null>
  /** Alternative to `targetRef` for targets whose rect is computed elsewhere (e.g. a virtualized row). */
  getRect?: () => DOMRect | null
  /** Called once the leaving transition finishes. The caller owns unmounting. */
  onDismiss: () => void
  /** Gap between the target's edge and the cutout, in px. */
  padding?: number
  /** Corner radius of the cutout, in px. */
  radius?: number
  className?: string
}

const DEFAULT_PADDING = 12
const DEFAULT_RADIUS = 10
// Matches the dialog/drawer overlay's own `duration-100`-class transitions —
// the leaving phase holds the component mounted this long so the opacity
// transition can actually play before the caller unmounts it.
const LEAVE_MS = 150

let instanceCounter = 0

function SpotlightScrim({ targetRef, getRect, onDismiss, padding = DEFAULT_PADDING, radius = DEFAULT_RADIUS, className }: SpotlightScrimProps) {
  const [maskId] = useState(() => `spotlight-scrim-mask-${++instanceCounter}`)
  const [cutout, setCutout] = useState<Cutout | null>(null)
  const [phase, setPhase] = useState<"entering" | "visible" | "leaving">("entering")
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const ownedTabIndexRef = useRef<HTMLElement | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const measure = useCallback((): DOMRect | null => (getRect ? getRect() : (targetRef?.current?.getBoundingClientRect() ?? null)), [getRect, targetRef])

  // Track the target's rect every frame — the target may scroll, resize, or
  // animate independently of this component's own render cycle. Genuine
  // rAF-loop-with-cleanup use, allowed under RULE 4.
  useEffect(() => {
    let raf = 0
    let prevKey = ""
    const tick = () => {
      const rect = measure()
      if (rect) {
        const key = `${rect.top},${rect.left},${rect.width},${rect.height}`
        if (key !== prevKey) {
          prevKey = key
          setCutout(computeCutout(rect, padding, window.innerWidth))
        }
      } else if (prevKey !== "") {
        prevKey = ""
        setCutout(null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [measure, padding])

  // Enter transition: flip to "visible" one frame after mount so the
  // opacity transition has a 0 -> 1 delta to animate instead of starting
  // already at its end state.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("visible"))
    return () => cancelAnimationFrame(raf)
  }, [])

  const dismiss = useCallback(() => {
    setPhase((current) => {
      if (current === "leaving") return current
      restoreFocus(previouslyFocusedRef.current)
      leaveTimerRef.current = setTimeout(onDismiss, LEAVE_MS)
      return "leaving"
    })
  }, [onDismiss])

  // Focus containment: move focus in on mount, trap Tab/Shift+Tab within
  // the spotlit region, dismiss on Escape. Mount-only by design (the
  // spotlight target for a given instance doesn't change mid-life) — the
  // ref is read once, deliberately excluded from deps.
  useEffect(() => {
    const target = targetRef?.current
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    if (target) {
      const focusables = collectFocusables(target)
      const toFocus = focusables[0] ?? target
      if (toFocus === target && !isFocusable(target)) {
        target.setAttribute("tabindex", "-1")
        ownedTabIndexRef.current = target
      }
      toFocus.focus({ preventScroll: true })
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (isDismissKey(event)) {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key !== "Tab" || !target) return
      const focusables = collectFocusables(target)
      const next = resolveTabTarget(document.activeElement, focusables, event.shiftKey ? -1 : 1)
      event.preventDefault()
      ;(next ?? target).focus({ preventScroll: true })
    }
    document.addEventListener("keydown", handleKeydown)

    return () => {
      document.removeEventListener("keydown", handleKeydown)
      if (ownedTabIndexRef.current) {
        ownedTabIndexRef.current.removeAttribute("tabindex")
        ownedTabIndexRef.current = null
      }
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: target is captured once for this instance's lifetime, not re-tracked reactively.
  }, [])

  if (!cutout) {
    // No measured target yet (first frame, or the target unmounted) — dim
    // the whole viewport rather than flash unstyled content; still
    // dismissible via Escape.
    return (
      <div
        role="presentation"
        aria-hidden
        className={cn("pointer-events-none fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] transition-opacity duration-150", phase === "entering" ? "opacity-0" : phase === "leaving" ? "opacity-0" : "opacity-100", className)}
      />
    )
  }

  const clipPath = buildScrimClipPath(cutout, radius)
  const opacityClass = phase === "visible" ? "opacity-100" : "opacity-0"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spotlight"
      className={cn("contents", className)}
    >
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-40" style={{ width: "100vw", height: "100vh" }}>
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={radius} ry={radius} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" className={cn("fill-black/10 transition-opacity duration-150", opacityClass)} mask={`url(#${maskId})`} />
      </svg>
      {/* This layer both dims the page AND owns scrim-tap-to-dismiss: the
          clip-path excludes the cutout from its hit area, so a click lands
          here (and dismisses) everywhere except over the spotlit target.
          aria-hidden: it's a pointer-only affordance — Escape and the
          contained Tab loop are the keyboard path, matching the backdrop
          convention already used by Dialog/Drawer in this package. */}
      <div
        aria-hidden
        onClick={dismiss}
        className={cn("fixed inset-0 z-40 cursor-default backdrop-blur-[1.5px] transition-opacity duration-150", opacityClass)}
        style={{ clipPath }}
      />
      <div
        aria-hidden
        className={cn("pointer-events-none fixed z-40 rounded-lg ring-2 ring-primary/50 transition-opacity duration-150", opacityClass)}
        style={{ left: cutout.x, top: cutout.y, width: cutout.w, height: cutout.h }}
      />
    </div>
  )
}

export { SpotlightScrim }
