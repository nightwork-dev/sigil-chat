"use client"

// One compositional control per value — a single bar expresses the whole
// state, so a value needs only one row:
//   • pinned   → a draggable slider, primary fill + handle
//   • derived  → a solid fill to the point, no handle
//   • bounded  → a [lo, hi] band with edge ticks
//   • free     → a faint ghost track
//   • conflicting → the track turns destructive and shows ⊥, while the
//     pinned handle still marks what was asserted
//
// Compound, Base UI style: <Root> takes the value and provides it via
// context; <Label>, <Readout>, <Pin>, <Track> read what they need through
// useTrackedValue(). CVA keys the visual variants off status, so every state
// is the same bar with a different variant, not a different component.
// <Row> is the conventional composition.

import { createContext, useContext, type ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { isPointRange, fmtNum, fmtRange, type Range } from "@workspace/ui/lib/range"
import { statusFillVariants, statusTextVariants, type ValueStatus } from "@workspace/ui/lib/value-status"
import { ConflictMark } from "@workspace/ui/components/constraints/conflict-mark"

export interface TrackedValue {
  id: string
  label: string
  /** The resolved value — a point or a range. */
  value: Range
  /** The [min, max] the bar is drawn within. */
  domain: [number, number]
  min: number
  max: number
  step: number
  status: ValueStatus
  pinned: boolean
  /** A display-only value (a pure consequence) sets this false — no pin toggle, no handle. */
  pinnable: boolean
  /** The value asserted while pinned — drives the handle position. */
  pinnedValue: number
  isOrigin?: boolean
  /** While conflicting & pinned: the range the OTHER constraints would still permit. */
  feasible?: Range
  onChange: (v: number) => void
  onPin: (pinned: boolean) => void
}

const TrackedValueContext = createContext<TrackedValue | null>(null)

function useTrackedValue(): TrackedValue {
  const ctx = useContext(TrackedValueContext)
  if (!ctx) throw new Error("PinnableTrack parts must render inside <PinnableTrack.Root>")
  return ctx
}

function Root({ value, children, className }: { value: TrackedValue; children: ReactNode; className?: string }) {
  return (
    <TrackedValueContext.Provider value={value}>
      <div data-slot="pinnable-track" className={cn("space-y-1.5", className)}>
        {children}
      </div>
    </TrackedValueContext.Provider>
  )
}

function Label({ className }: { className?: string }) {
  const { id, label } = useTrackedValue()
  return (
    <label htmlFor={`pt-${id}`} className={cn("font-mono text-[11px] text-muted-foreground", className)}>
      {label}
    </label>
  )
}

function Readout({ className }: { className?: string }) {
  const { value, status, pinned, pinnedValue, isOrigin } = useTrackedValue()
  const conflicting = status === "conflicting"

  if (conflicting) {
    return (
      <ConflictMark conflicting isOrigin={isOrigin} className={cn(statusTextVariants({ status }), className)}>
        {pinned ? fmtNum(pinnedValue) : "⊥"}
      </ConflictMark>
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", statusTextVariants({ status }), className)}>
      {pinned ? fmtNum(pinnedValue) : fmtRange(value)}
    </span>
  )
}

function Pin({ className }: { className?: string }) {
  const { pinned, pinnable, label, onPin } = useTrackedValue()
  if (!pinnable) return null
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pinned}
      aria-label={`pin ${label}`}
      onClick={() => onPin(!pinned)}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full outline-none ring-ring transition-colors focus-visible:ring-2",
        "before:absolute before:-inset-2.5 before:content-['']",
        pinned ? "bg-primary" : "bg-muted-foreground/30",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3 rounded-full bg-background transition-transform",
          pinned ? "translate-x-3.5" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

function Track({ className }: { className?: string }) {
  const { id, label, value, domain, min, max, step, status, pinned, pinnedValue, feasible, onChange } = useTrackedValue()
  const [dlo, dhi] = domain
  const span = dhi - dlo || 1
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - dlo) / span) * 100))
  const conflicting = status === "conflicting"

  if (pinned) {
    const hp = pct(pinnedValue)
    const flo = conflicting && feasible && Number.isFinite(feasible.lo) ? feasible.lo : null
    const fhi = conflicting && feasible && Number.isFinite(feasible.hi) ? feasible.hi : null
    const hasFeasible = flo != null && fhi != null

    return (
      <div className={cn("relative h-3 w-full", className)}>
        <div className="absolute inset-0 overflow-hidden rounded-md bg-muted">
          {hasFeasible ? (
            <>
              <div className="absolute inset-y-0 left-0 bg-destructive/55" style={{ width: `${pct(flo)}%` }} />
              {pinnedValue > fhi && (
                <div className="absolute inset-y-0 bg-destructive/55" style={{ left: `${pct(fhi)}%`, width: `${hp - pct(fhi)}%` }} />
              )}
              <div
                className="absolute inset-y-0 bg-primary/70"
                style={{ left: `${pct(flo)}%`, width: `${Math.max(0, pct(fhi) - pct(flo))}%` }}
              />
            </>
          ) : (
            <div
              className={cn("absolute inset-y-0 left-0 transition-[width] duration-150", conflicting ? "bg-destructive/55" : "bg-primary")}
              style={{ width: `${hp}%` }}
            />
          )}
        </div>

        {hasFeasible && (
          <>
            <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `${pct(flo)}%` }} />
            {fhi > flo && (
              <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `calc(${pct(fhi)}% - 2px)` }} />
            )}
          </>
        )}

        <input
          id={`pt-${id}`}
          type="range"
          aria-label={label}
          value={pinnedValue}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="peer absolute inset-x-0 -inset-y-1.5 z-10 cursor-pointer opacity-0"
        />
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-white shadow-sm transition-shadow",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
            conflicting ? "border-destructive" : "border-primary"
          )}
          style={{ left: `${hp}%` }}
        />
      </div>
    )
  }

  // non-pinned: display-only, same bar shape minus the handle.
  const lo = Number.isFinite(value.lo) ? value.lo : dlo
  const hi = Number.isFinite(value.hi) ? value.hi : dhi
  const point = !conflicting && isPointRange(value)

  return (
    <div className={cn("relative h-3 w-full overflow-hidden rounded-md bg-muted", className)}>
      {conflicting ? (
        <>
          <div className="h-full w-full bg-destructive/15" />
          <span aria-hidden className="absolute inset-0 flex items-center justify-center font-mono text-[10px] leading-none text-destructive">
            ⊥
          </span>
        </>
      ) : point ? (
        <div className={cn(statusFillVariants({ status }))} style={{ left: 0, width: `${pct(lo)}%` }} />
      ) : (
        <>
          <div
            className={cn(statusFillVariants({ status }))}
            style={{ left: `${pct(lo)}%`, width: `${Math.max(2, pct(hi) - pct(lo))}%` }}
          />
          <div className="absolute top-1/2 h-2.5 w-[1.5px] -translate-y-1/2 bg-primary/60" style={{ left: `${pct(lo)}%` }} />
          <div className="absolute top-1/2 h-2.5 w-[1.5px] -translate-y-1/2 bg-primary/60" style={{ left: `calc(${pct(hi)}% - 1.5px)` }} />
        </>
      )}
    </div>
  )
}

function Row({ value, className }: { value: TrackedValue; className?: string }) {
  return (
    <Root value={value} className={className}>
      <div className="flex items-center justify-between gap-3">
        <Label />
        <div className="flex items-center gap-2">
          <Readout />
          <Pin />
        </div>
      </div>
      <Track />
    </Root>
  )
}

export const PinnableTrack = { Root, Label, Readout, Pin, Track, Row }
