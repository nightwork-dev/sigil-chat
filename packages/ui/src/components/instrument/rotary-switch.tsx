"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  angleToFraction,
  detentFraction,
  fractionToAngleDeg,
  nearestDetentIndex,
} from "@workspace/ui/lib/rotary"

export interface RotaryOption {
  value: string
  label: string
}

export interface RotarySwitchProps {
  /** Currently selected option value. */
  value: string
  /** Detent positions — string[] (value === label) or explicit {value,label}[]. */
  options: readonly string[] | readonly RotaryOption[]
  /** Fires with the selected option's value when a new detent is chosen. */
  onChange: (value: string) => void
  /** Optional caption below the readout. */
  label?: string
  /** Dial diameter in px (default 56). */
  size?: number
  className?: string
}

function normalizeOptions(
  options: readonly string[] | readonly RotaryOption[],
): RotaryOption[] {
  return options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  )
}

/** Angle (deg, y-down convention) of detent i across the shared rotary sweep. */
function detentAngle(i: number, count: number): number {
  return fractionToAngleDeg(detentFraction(i, count))
}

function pointAt(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Project a raw pointer angle onto the nearest detent index. */
function angleToIndex(rawDeg: number, count: number): number {
  return nearestDetentIndex(angleToFraction(rawDeg), count)
}

export function RotarySwitch({
  value,
  options,
  onChange,
  label,
  size = 56,
  className,
}: RotarySwitchProps) {
  const opts = normalizeOptions(options)
  const count = opts.length
  const selectedIndex = Math.max(
    0,
    opts.findIndex((o) => o.value === value),
  )

  const draggingRef = React.useRef(false)
  const [dragging, setDragging] = React.useState(false)

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 2

  const commitFromPointer = React.useCallback(
    (clientX: number, clientY: number, el: SVGSVGElement) => {
      const rect = el.getBoundingClientRect()
      const px = clientX - (rect.left + rect.width / 2)
      const py = clientY - (rect.top + rect.height / 2)
      const deg = (Math.atan2(py, px) * 180) / Math.PI
      const idx = angleToIndex(deg, count)
      const next = opts[idx]
      if (next && next.value !== value) onChange(next.value)
    },
    [count, opts, onChange, value],
  )

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setDragging(true)
    commitFromPointer(e.clientX, e.clientY, e.currentTarget)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    commitFromPointer(e.clientX, e.clientY, e.currentTarget)
  }

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Already released / detached.
    }
  }

  const step = (delta: number) => {
    const nextIdx = Math.max(0, Math.min(count - 1, selectedIndex + delta))
    const next = opts[nextIdx]
    if (next && next.value !== value) onChange(next.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault()
        step(1)
        break
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault()
        step(-1)
        break
      case "Home":
        e.preventDefault()
        step(-count)
        break
      case "End":
        e.preventDefault()
        step(count)
        break
    }
  }

  const pointerDeg = detentAngle(selectedIndex, count)
  const pointerTip = pointAt(cx, cy, r * 0.62, pointerDeg)
  const pointerBase = pointAt(cx, cy, r * 0.16, pointerDeg)
  const selectedLabel = opts[selectedIndex]?.label ?? ""

  return (
    <div
      data-slot="rotary-switch"
      className={cn("inline-flex flex-col items-center gap-1", className)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={selectedIndex}
        aria-valuetext={selectedLabel}
        aria-label={label}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className={cn(
          "cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-full",
          dragging && "select-none",
        )}
      >
        {/* Dial body */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--color-muted)"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />

        {/* Detent ticks — click any to select. */}
        {opts.map((o, i) => {
          const deg = detentAngle(i, count)
          const outer = pointAt(cx, cy, r * 0.9, deg)
          const inner = pointAt(cx, cy, r * 0.74, deg)
          const active = i === selectedIndex
          return (
            <line
              key={o.value}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={active ? "var(--color-primary)" : "var(--color-border)"}
              strokeWidth={active ? 2.5 : 1.5}
              strokeLinecap="round"
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation()
                if (o.value !== value) onChange(o.value)
              }}
            />
          )
        })}

        {/* Pointer */}
        <line
          x1={pointerBase.x}
          y1={pointerBase.y}
          x2={pointerTip.x}
          y2={pointerTip.y}
          stroke="var(--color-primary)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Center hub */}
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.16}
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
      </svg>

      <span className="font-mono text-[9px] font-semibold tracking-wider uppercase text-foreground tabular-nums leading-none">
        {selectedLabel}
      </span>
      {label && (
        <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground leading-none">
          {label}
        </span>
      )}
    </div>
  )
}
