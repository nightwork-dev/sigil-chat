"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { SparkLine } from "@workspace/ui/components/sparkline"

export interface MonitorProps {
  /**
   * Current sample. Each time this changes, it's pushed onto an internal
   * rolling buffer and the trace scrolls left. Ignored when `data` is given.
   */
  value?: number
  /**
   * Fully-controlled trace. When provided, the component renders this array
   * directly instead of maintaining an internal buffer.
   */
  data?: number[]
  /** Rolling window length for the live `value` mode (default 40). */
  windowSize?: number
  /** Caption above the trace. */
  label?: string
  /** Unit suffix on the readout (e.g. "Hz", "%"). */
  unit?: string
  /** Lower/upper clamp + readout context for incoming samples. */
  min?: number
  max?: number
  /** Digits after the decimal in the readout (default 0). */
  precision?: number
  width?: number
  height?: number
  className?: string
}

export function Monitor({
  value,
  data,
  windowSize = 40,
  label,
  unit,
  min,
  max,
  precision = 0,
  width = 160,
  height = 40,
  className,
}: MonitorProps) {
  const clamp = (v: number) => {
    let out = v
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }

  // Live rolling buffer. When `value` changes we adjust state DURING render
  // (React's sanctioned "store info from previous renders" pattern) rather
  // than syncing via useEffect.
  const [buffer, setBuffer] = React.useState<number[]>(() =>
    value === undefined ? [] : [clamp(value)],
  )
  const [prevValue, setPrevValue] = React.useState(value)

  if (data === undefined && value !== undefined && value !== prevValue) {
    setPrevValue(value)
    setBuffer((b) => {
      const next = [...b, clamp(value)]
      return next.length > windowSize ? next.slice(next.length - windowSize) : next
    })
  }

  const trace = data ?? buffer
  const current = trace.length > 0 ? trace[trace.length - 1] : undefined

  return (
    <div
      data-slot="monitor"
      className={cn(
        "inline-flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5",
        className,
      )}
    >
      {label && (
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
          {label}
        </span>
      )}

      <div className="flex items-end gap-3">
        {/* Trace */}
        <div
          className="relative overflow-hidden rounded-sm bg-background/60"
          style={{ width, height }}
        >
          {trace.length >= 2 ? (
            <SparkLine
              data={trace}
              width={width}
              height={height}
              className="text-info drop-shadow-[0_0_2px_var(--color-info)]"
              color="var(--color-info)"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              waiting…
            </div>
          )}
        </div>

        {/* Readout */}
        <div className="flex flex-col items-end leading-none">
          <span className="font-mono text-lg font-semibold tabular-nums text-info drop-shadow-[0_0_4px_var(--color-info)]">
            {current !== undefined ? current.toFixed(precision) : "—"}
          </span>
          {unit && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
