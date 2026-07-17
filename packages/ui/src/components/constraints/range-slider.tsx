"use client"

// A slider that's ONE handle by default but can be SPLIT into two
// independently-set bounds — the same gesture covers "= v", "≤ hi", "≥ lo",
// and "[lo, hi]", you just set a different combination of the two handles.
//
//   collapsed          → one handle → sets a single value
//   split, hi set      → "≤ hi"
//   split, lo set      → "≥ lo"
//   split, both set    → "[lo, hi]"
//   split, neither set → fully open
//
// Drag-to-nearest-handle: clicking anywhere on a split track grabs whichever
// handle is closer and starts dragging it from there.

import { useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { hatch } from "@workspace/ui/lib/patterns"
import { fmtNum, fmtRange, type Range } from "@workspace/ui/lib/range"

export interface RangeSliderState {
  split: boolean
  value: number // collapsed single value
  lo: number
  hi: number
  loSet: boolean
  hiSet: boolean
}

export function defaultRangeSliderState(value: number, set = false): RangeSliderState {
  return { split: false, value, lo: value, hi: value, loSet: set, hiSet: set }
}

/** The range this control currently asserts, or null when it asserts nothing. */
export function rangeSliderValue(s: RangeSliderState): Range | null {
  if (!s.split) return s.loSet || s.hiSet ? { lo: s.value, hi: s.value } : null
  const lo = s.loSet ? s.lo : -Infinity
  const hi = s.hiSet ? s.hi : Infinity
  if (lo === -Infinity && hi === Infinity) return null
  return { lo, hi }
}

interface RangeSliderProps {
  label: string
  min: number
  max: number
  step: number
  domain: [number, number]
  /** The current derived/display range — shown as a faint fill when nothing is set. */
  derived: Range
  conflicting?: boolean
  /** When conflicting, the range that would actually be valid — shown so the user can see where to drag. */
  feasible?: Range
  state: RangeSliderState
  onChange: (s: RangeSliderState) => void
  unit?: string
  className?: string
}

function RangeSlider({
  label,
  min,
  max,
  step,
  domain,
  derived,
  conflicting = false,
  feasible,
  state,
  onChange,
  unit,
  className,
}: RangeSliderProps) {
  const [dlo, dhi] = domain
  const span = dhi - dlo || 1
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - dlo) / span) * 100))
  const set = (patch: Partial<RangeSliderState>) => onChange({ ...state, ...patch })

  const readout = conflicting
    ? feasible
      ? `⊥ · valid ${fmtRange(feasible)}`
      : "⊥"
    : !state.split
      ? state.loSet || state.hiSet
        ? `= ${fmtNum(state.value)}`
        : fmtRange(derived)
      : state.loSet && state.hiSet
        ? `[${fmtNum(state.lo)}, ${fmtNum(state.hi)}]`
        : state.hiSet
          ? `≤ ${fmtNum(state.hi)}`
          : state.loSet
            ? `≥ ${fmtNum(state.lo)}`
            : fmtRange(derived)

  return (
    <div data-slot="range-slider" className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="font-mono text-[11px] text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              conflicting
                ? "text-destructive"
                : state.loSet || state.hiSet
                  ? "text-primary"
                  : "text-muted-foreground"
            )}
          >
            {readout}
            {unit && readout !== "⊥" ? unit : ""}
          </span>
          <button
            type="button"
            aria-label={state.split ? `merge ${label} to one value` : `split ${label} into bounds`}
            onClick={() => {
              if (state.split) {
                set({ split: false, value: state.loSet ? state.lo : state.hi, loSet: false, hiSet: state.loSet || state.hiSet })
              } else {
                // open the two handles straddling the current point value (not
                // the unrelated derived range) so splitting feels continuous —
                // spread by a small offset so both handles start grabbable.
                const clamp = (n: number) => Math.max(min, Math.min(max, n))
                const offset = Math.max(step, (max - min) * 0.08)
                const lo = clamp(state.value - offset)
                const hi = clamp(state.value + offset)
                set({ split: true, lo, hi, loSet: false, hiSet: state.loSet || state.hiSet })
              }
            }}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
              state.split ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {state.split ? "merge" : "split"}
          </button>
        </div>
      </div>

      {state.split ? (
        <SplitTrack pct={pct} state={state} set={set} min={min} max={max} step={step} conflicting={conflicting} derived={derived} feasible={feasible} />
      ) : (
        <PointTrack pct={pct} state={state} set={set} min={min} max={max} step={step} conflicting={conflicting} derived={derived} feasible={feasible} />
      )}
    </div>
  )
}

interface TrackProps {
  pct: (v: number) => number
  state: RangeSliderState
  set: (p: Partial<RangeSliderState>) => void
  min: number
  max: number
  step: number
  conflicting: boolean
  derived: Range
  feasible?: Range
}

function PointTrack({ pct, state, set, min, max, step, conflicting, derived, feasible }: TrackProps) {
  const hp = pct(state.value)
  const set_ = state.loSet || state.hiSet
  const derivedPoint = Number.isFinite(derived.lo) && Number.isFinite(derived.hi) ? (derived.lo + derived.hi) / 2 : state.value
  const handlePct = set_ ? hp : pct(derivedPoint)
  const fLo = feasible && Number.isFinite(feasible.lo) ? pct(feasible.lo) : null
  const fHi = feasible && Number.isFinite(feasible.hi) ? pct(feasible.hi) : null

  return (
    <div className="relative h-3 w-full">
      <div className="absolute inset-0 overflow-hidden rounded-md bg-muted">
        {!set_ ? (
          <DerivedFill derived={derived} pct={pct} />
        ) : conflicting ? (
          <>
            <div className="absolute inset-y-0 left-0 bg-destructive/55" style={{ width: `${hp}%` }} />
            {fLo != null && fHi != null && (
              <div className="absolute inset-y-0 bg-primary/85" style={{ left: `${fLo}%`, width: `${Math.max(1.5, fHi - fLo)}%` }} />
            )}
          </>
        ) : (
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${hp}%` }} />
        )}
      </div>
      {conflicting && fLo != null && (
        <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `${fLo}%` }} />
      )}
      {conflicting && fHi != null && fLo != null && fHi > fLo + 0.5 && (
        <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `calc(${fHi}% - 2px)` }} />
      )}
      <input
        type="range"
        aria-label="value"
        min={min}
        max={max}
        step={step}
        value={state.value}
        onChange={(e) => set({ value: Number(e.target.value), loSet: true, hiSet: true })}
        className="peer absolute inset-x-0 -inset-y-1.5 z-10 cursor-pointer opacity-0"
      />
      <Handle pct={handlePct} active={set_} conflicting={conflicting} onToggle={() => set({ loSet: !set_, hiSet: !set_ })} />
    </div>
  )
}

function SplitTrack({ pct, state, set, min, max, step, conflicting, derived, feasible }: TrackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const activeHandle = useRef<"lo" | "hi" | null>(null)

  const snapToValue = (clientX: number): number => {
    if (!trackRef.current) return min
    const rect = trackRef.current.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + t * (max - min)
    return Math.max(min, Math.min(max, Math.round(raw / step) * step))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickPct = ((e.clientX - rect.left) / rect.width) * 100
    const distLo = Math.abs(clickPct - pct(state.lo))
    const distHi = Math.abs(clickPct - pct(state.hi))
    activeHandle.current = distLo <= distHi ? "lo" : "hi"
    e.currentTarget.setPointerCapture(e.pointerId)
    const value = snapToValue(e.clientX)
    if (activeHandle.current === "lo") set({ lo: value, loSet: true })
    else set({ hi: value, hiSet: true })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeHandle.current) return
    const value = snapToValue(e.clientX)
    if (activeHandle.current === "lo") set({ lo: value, loSet: true })
    else set({ hi: value, hiSet: true })
  }

  const onPointerUp = () => {
    activeHandle.current = null
  }

  const lp = pct(state.lo)
  const rp = pct(state.hi)
  const fLo = feasible && Number.isFinite(feasible.lo) ? pct(feasible.lo) : null
  const fHi = feasible && Number.isFinite(feasible.hi) ? pct(feasible.hi) : null
  const assLeft = state.loSet ? lp : 0
  const assRight = state.hiSet ? rp : 100
  const asserted = state.loSet || state.hiSet
  const dLoPct = Number.isFinite(derived.lo) ? pct(derived.lo) : 0
  const dHiPct = Number.isFinite(derived.hi) ? pct(derived.hi) : 100
  const metLeft = Math.max(assLeft, dLoPct)
  const metRight = Math.min(assRight, dHiPct)
  const unmetHi = !conflicting && state.hiSet && dHiPct < assRight - 0.5
  const unmetLo = !conflicting && state.loSet && dLoPct > assLeft + 0.5

  return (
    <div
      ref={trackRef}
      className="relative h-3 w-full cursor-pointer touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute inset-0 overflow-hidden rounded-md bg-muted">
        {conflicting ? (
          <>
            <div className="h-full w-full bg-destructive/30" />
            {fLo != null && fHi != null && (
              <div className="absolute inset-y-0 bg-primary/85" style={{ left: `${fLo}%`, width: `${Math.max(1.5, fHi - fLo)}%` }} />
            )}
          </>
        ) : asserted ? (
          <>
            <div
              className="absolute inset-y-0"
              style={{
                left: `${assLeft}%`,
                width: `${Math.max(0, assRight - assLeft)}%`,
                opacity: 0.4,
                backgroundImage: hatch({ angle: 45, thickness: 1.5, spacing: 5, color: "var(--color-primary)" }),
              }}
            />
            {metRight > metLeft && (
              <div className="absolute inset-y-0 bg-primary/85" style={{ left: `${metLeft}%`, width: `${metRight - metLeft}%` }} />
            )}
          </>
        ) : (
          <DerivedFill derived={derived} pct={pct} />
        )}
      </div>
      {unmetHi && <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `calc(${dHiPct}% - 1px)` }} />}
      {unmetLo && <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `${dLoPct}%` }} />}
      {conflicting && fLo != null && <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `${fLo}%` }} />}
      {conflicting && fHi != null && fLo != null && fHi > fLo + 0.5 && (
        <div className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-primary" style={{ left: `calc(${fHi}% - 2px)` }} />
      )}
      {conflicting && (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] leading-none text-destructive">
          ⊥
        </span>
      )}
      <Handle pct={lp} active={state.loSet} conflicting={conflicting} onToggle={() => set({ loSet: !state.loSet })} sideLabel="≥" />
      <Handle pct={rp} active={state.hiSet} conflicting={conflicting} onToggle={() => set({ hiSet: !state.hiSet })} sideLabel="≤" />
    </div>
  )
}

function DerivedFill({ derived, pct }: { derived: Range; pct: (v: number) => number }) {
  const lo = Number.isFinite(derived.lo) ? derived.lo : 0
  const hi = Number.isFinite(derived.hi) ? derived.hi : 0
  return (
    <div className="absolute inset-y-0 bg-primary/10" style={{ left: `${pct(lo)}%`, width: `${Math.max(2, pct(hi) - pct(lo))}%` }} />
  )
}

// A handle: the visible knob + a toggle dot above it (click the dot to set/
// release THIS side independently). When inactive it's just a line marking
// the current value — clicking the track behind it activates + jumps it.
function Handle({
  pct,
  active,
  conflicting,
  onToggle,
  sideLabel,
}: {
  pct: number
  active: boolean
  conflicting: boolean
  onToggle: () => void
  sideLabel?: string
}) {
  if (!active) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded",
          conflicting ? "bg-destructive" : "bg-muted-foreground/70"
        )}
        style={{ left: `${pct}%` }}
      />
    )
  }
  return (
    <div className="group/handle contents">
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-white shadow-sm",
          conflicting ? "border-destructive" : "border-primary"
        )}
        style={{ left: `${pct}%` }}
      />
      <button
        type="button"
        aria-label={["release", sideLabel, "bound"].filter(Boolean).join(" ")}
        onClick={onToggle}
        className="absolute z-30 -top-3 size-2.5 -translate-x-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover/handle:opacity-100 focus-visible:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}

export { RangeSlider }
export type { RangeSliderProps }
