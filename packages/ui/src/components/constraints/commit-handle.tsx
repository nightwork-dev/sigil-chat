"use client"

// Drag a value into an open range, commit on release.
//
// Unlike ValueScrubber/CompactSlider (which call onChange continuously while
// dragging), CommitHandle holds a local draft value and only fires onCommit
// on pointerup — for "propose then confirm" interactions: collapsing a
// decision range, locking in a budget split, picking a value that conflicts
// until released. Once committed, the handle shrinks and shows a clear
// button that reopens the range (onClear).

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const snap = (v: number, lo: number, step: number) =>
  step > 0 ? lo + Math.round((v - lo) / step) * step : v

const pct = (v: number, min: number, max: number) =>
  max <= min ? 0 : Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))

interface CommitHandleProps {
  /** The open range the handle may travel within. */
  lo: number
  hi: number
  /** The full visual domain the parent track is drawn against. */
  domain: [number, number]
  step?: number
  /** Current committed value. Undefined = not yet committed → draggable, hollow handle. */
  committed?: number
  onCommit: (value: number) => void
  onClear: () => void
  className?: string
}

function CommitHandle({
  lo,
  hi,
  domain,
  step = 0,
  committed,
  onCommit,
  onClear,
  className,
}: CommitHandleProps) {
  const [min, max] = domain
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [draft, setDraft] = React.useState<number | null>(null)

  const valueFromPointer = React.useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return lo
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return lo
      const ratio = (clientX - rect.left) / rect.width
      const raw = min + ratio * (max - min)
      return clamp(snap(raw, lo, step), lo, hi)
    },
    [lo, hi, min, max, step]
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDraft(valueFromPointer(e.clientX))
    },
    [valueFromPointer]
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (draft === null) return
      setDraft(valueFromPointer(e.clientX))
    },
    [draft, valueFromPointer]
  )

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (draft === null) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      onCommit(draft)
      setDraft(null)
    },
    [draft, onCommit]
  )

  // Cancel (e.g. an OS gesture interrupting the drag) aborts the draft
  // without committing — distinct from pointerup, which commits.
  const handlePointerCancel = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (draft === null) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      setDraft(null)
    },
    [draft]
  )

  // Keyboard parity: arrows step a draft within [lo, hi], Enter/Space commits.
  // Without this the role="slider" advertises an interaction it can't honor.
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const cur = draft ?? committed ?? lo
      const d = step > 0 ? step : (hi - lo) / 20
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        setDraft(clamp(snap(cur + d, lo, step), lo, hi))
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        setDraft(clamp(snap(cur - d, lo, step), lo, hi))
      } else if (e.key === "Home") {
        setDraft(lo)
      } else if (e.key === "End") {
        setDraft(hi)
      } else if (e.key === "Enter" || e.key === " ") {
        onCommit(draft ?? lo)
        setDraft(null)
      } else {
        return
      }
      e.preventDefault()
    },
    [draft, committed, lo, hi, step, onCommit]
  )

  const isCommitted = committed != null
  const handleAt = draft ?? committed ?? lo

  return (
    <div
      data-slot="commit-handle"
      ref={trackRef}
      className={cn("absolute inset-0 cursor-pointer touch-none select-none", className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        role="slider"
        aria-label="commit a value into the open range"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={handleAt}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ring-ring transition-colors focus-visible:ring-2",
          // committed = solid copper; actively dragging = solid amber; idle-open =
          // hollow amber ring, so an unplaced handle doesn't read as "set to lo".
          isCommitted
            ? "bg-chart-2"
            : draft != null
              ? "bg-primary"
              : "border-2 border-primary bg-background"
        )}
        style={{ left: `${pct(handleAt, min, max)}%` }}
      />
      {isCommitted && (
        <button
          type="button"
          onClick={onClear}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="clear committed value and reopen the range"
          className="absolute top-1/2 right-0 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground outline-none ring-ring transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:ring-2"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </div>
  )
}

export { CommitHandle }
export type { CommitHandleProps }
