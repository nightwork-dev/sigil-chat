"use client"

// ImageCompare: a before/after reveal slider. Two images stack in the same box;
// a draggable vertical divider clips the "after" image, wiping it over the
// "before" as you drag. The classic "restoration / edit / diff" affordance.
//
// The "after" layer is clipped with inset() to the current position so the
// "before" shows through on the left and "after" on the right of the seam. The
// seam itself is a thin bg-background/border-border line with a round grab
// handle centered on it — a clear, hit-friendly affordance, not a hairline.
//
// Interaction is pointer-drag on the whole surface (pointer capture, so the
// drag survives leaving the box) PLUS full keyboard: the handle is
// role="slider" with arrow keys (±2%, Shift ±10%), Home/End to the extremes,
// and aria-value* reporting the reveal percent. Position lives in useState;
// there is no useEffect for derived state.
//
// SSR-safe: position is seeded from `initial` (no window at render). The clip
// and handle offset are rounded to 2dp on write so the SSR and client style
// strings match to the character — no hydration mismatch on the inline style.
//
// Tokens only: the seam/handle use bg-background + border-border + the ring
// token on focus; the labels are muted chips over a scrim.

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface CompareImage {
  src: string
  alt: string
  label?: string
}

export interface ImageCompareProps extends React.ComponentProps<"div"> {
  before: CompareImage
  after: CompareImage
  /** Initial reveal position, 0..1. Default 0.5. */
  initial?: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
// 2dp keeps the SSR string and the client string byte-identical (no float ULP
// drift in the inline style → no hydration mismatch).
const pct = (n: number) => `${(clamp01(n) * 100).toFixed(2)}%`

function ImageCompare({
  before,
  after,
  initial = 0.5,
  className,
  ...props
}: ImageCompareProps) {
  const [position, setPosition] = React.useState(() => clamp01(initial))
  const containerRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)

  const setFromClientX = (clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    setPosition(clamp01((clientX - rect.left) / rect.width))
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setFromClientX(event.clientX)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    setFromClientX(event.clientX)
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault()
        setPosition((p) => clamp01(p - step))
        break
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault()
        setPosition((p) => clamp01(p + step))
        break
      case "Home":
        event.preventDefault()
        setPosition(0)
        break
      case "End":
        event.preventDefault()
        setPosition(1)
        break
    }
  }

  return (
    <div
      ref={containerRef}
      data-slot="image-compare"
      className={cn(
        "group/compare relative select-none overflow-hidden rounded-lg bg-muted",
        "cursor-ew-resize touch-none",
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      {...props}
    >
      {/* BEFORE — full-bleed base layer. */}
      <img
        src={before.src}
        alt={before.alt}
        draggable={false}
        className="block h-full w-full object-cover"
      />
      {before.label && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur-xs">
          {before.label}
        </span>
      )}

      {/* AFTER — clipped from the left to the seam so it reveals over BEFORE. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${pct(position)})` }}
      >
        <img
          src={after.src}
          alt={after.alt}
          draggable={false}
          className="block h-full w-full object-cover"
        />
        {after.label && (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur-xs">
            {after.label}
          </span>
        )}
      </div>

      {/* SEAM + handle — the grab affordance and the keyboard slider. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Reveal position"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-valuetext={`${Math.round(position * 100)}% revealed`}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 z-10 flex w-0 items-center justify-center outline-none"
        style={{ left: pct(position) }}
      >
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background/90 shadow-[0_0_0_1px_var(--color-border)]" />
        <div className="relative flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors group-focus-within/compare:border-ring group-focus-within/compare:ring-2 group-focus-within/compare:ring-ring/40">
          <GripVerticalIcon className="size-4" />
        </div>
      </div>
    </div>
  )
}

export { ImageCompare }
