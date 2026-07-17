// Read-only display of a Range positioned within a domain — a point renders
// as a 2px needle, a bounded range as a filled span with edge ticks. An
// uncommitted range pulses gently (a decision not yet made). Pure
// presentational: no drag, no state — pair with RangeSlider for the
// interactive version.

import { cn } from "@workspace/ui/lib/utils"
import { isPointRange, fmtNum, type Range } from "@workspace/ui/lib/range"
import type { ValueStatus } from "@workspace/ui/lib/value-status"
import { toPercent as pct } from "@workspace/ui/lib/interaction"

interface RangeTrackProps {
  value: Range
  domain: [number, number]
  /** A committed range doesn't pulse — the decision is made. Points never pulse. */
  committed?: boolean
  status?: ValueStatus
  showLabels?: boolean
  className?: string
}

function RangeTrack({ value, domain, committed, status, showLabels = true, className }: RangeTrackProps) {
  const [min, max] = domain
  const point = isPointRange(value)
  const conflicting = status === "conflicting"
  const pulsing = !point && !committed && status !== "pinned"

  if (point) {
    const left = pct(value.lo, min, max)
    return (
      <div data-slot="range-track" className={cn("space-y-1", className)}>
        {showLabels && (
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">{fmtNum(value.lo)}</div>
        )}
        <div className="relative h-1.5 rounded-full bg-muted">
          <div
            className={cn("absolute top-1/2 h-3 w-[2px] -translate-y-1/2", conflicting ? "bg-destructive/60" : "bg-primary")}
            style={{ left: `${left}%` }}
          />
        </div>
      </div>
    )
  }

  const lo = pct(value.lo, min, max)
  const hi = pct(value.hi, min, max)
  const width = Math.max(0, hi - lo)

  return (
    <div data-slot="range-track" className={cn("space-y-1", className)}>
      {showLabels && (
        <div className="flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{fmtNum(value.lo)}</span>
          <span>{fmtNum(value.hi)}</span>
        </div>
      )}
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 rounded-full",
            conflicting ? "bg-destructive/20" : "bg-primary/20",
            pulsing && "animate-pulse"
          )}
          style={{ left: `${lo}%`, width: `${width}%` }}
        />
        <div
          className={cn("absolute top-1/2 h-2.5 w-px -translate-y-1/2", conflicting ? "bg-destructive/40" : "bg-primary/40")}
          style={{ left: `${lo}%` }}
        />
        <div
          className={cn("absolute top-1/2 h-2.5 w-px -translate-y-1/2", conflicting ? "bg-destructive/40" : "bg-primary/40")}
          style={{ left: `${hi}%` }}
        />
      </div>
    </div>
  )
}

export { RangeTrack }
export type { RangeTrackProps }
