"use client"

import { cn } from "@workspace/ui/lib/utils"
import { hexToHsb, hsbToCss, hsbToHex } from "@workspace/ui/lib/color"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"

export interface ColorInputProps {
  /** Current color as a hex string (#rrggbb). */
  value: string
  /** Fires with the next hex string on any channel change. */
  onChange: (hex: string) => void
  className?: string
}

// --- One thin channel slider (absolute-x drag, touch-correct via the core). ---

interface ChannelProps {
  label: string
  value: number
  min: number
  max: number
  /** CSS background for the track gradient. */
  gradient: string
  /** Formatted readout for the current value. */
  readout: string
  onChange: (v: number) => void
}

function Channel({
  label,
  value,
  min,
  max,
  gradient,
  readout,
  onChange,
}: ChannelProps) {
  const { targetProps, dragging } = useBoundedVector({
    axes: [{ min, max }],
    value: [value],
    onChange: (next) => onChange(next[0]),
    mapping: { mode: "absolute", orientation: "x" },
  })
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="flex items-center gap-2">
      <span className="w-3 font-mono text-[9px] font-semibold uppercase text-muted-foreground leading-none">
        {label}
      </span>
      <div
        {...targetProps}
        aria-label={label}
        className={cn(
          "relative h-4 flex-1 cursor-pointer rounded-[3px] border border-border",
          dragging && "select-none",
        )}
        style={{ ...targetProps.style, background: gradient }}
      >
        {/* Handle */}
        <div
          className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-2 border-background shadow-[0_0_0_1px_var(--color-border)]"
          style={{ left: `${pct}%`, backgroundColor: "transparent" }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[9px] tabular-nums text-muted-foreground leading-none">
        {readout}
      </span>
    </div>
  )
}

export function ColorInput({ value, onChange, className }: ColorInputProps) {
  const hsb = hexToHsb(value)

  const hueGradient =
    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
  const satGradient = `linear-gradient(to right, ${hsbToCss({ h: hsb.h, s: 0, b: hsb.b })}, ${hsbToCss({ h: hsb.h, s: 1, b: hsb.b })})`
  const briGradient = `linear-gradient(to right, #000, ${hsbToCss({ h: hsb.h, s: hsb.s, b: 1 })})`

  return (
    <div
      data-slot="color-input"
      className={cn(
        "flex w-full max-w-xs items-center gap-3 rounded-md border border-border bg-card p-2.5",
        className,
      )}
    >
      {/* Swatch + hex readout */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="size-9 rounded-md border border-border"
          style={{ backgroundColor: hsbToCss(hsb) }}
        />
        <span className="font-mono text-[9px] uppercase tabular-nums text-muted-foreground leading-none">
          {value}
        </span>
      </div>

      {/* Channels */}
      <div className="flex flex-1 flex-col gap-1.5">
        <Channel
          label="H"
          value={hsb.h}
          min={0}
          max={360}
          gradient={hueGradient}
          readout={`${Math.round(hsb.h)}`}
          onChange={(h) => onChange(hsbToHex({ ...hsb, h }))}
        />
        <Channel
          label="S"
          value={hsb.s}
          min={0}
          max={1}
          gradient={satGradient}
          readout={`${Math.round(hsb.s * 100)}`}
          onChange={(s) => onChange(hsbToHex({ ...hsb, s }))}
        />
        <Channel
          label="B"
          value={hsb.b}
          min={0}
          max={1}
          gradient={briGradient}
          readout={`${Math.round(hsb.b * 100)}`}
          onChange={(b) => onChange(hsbToHex({ ...hsb, b }))}
        />
      </div>
    </div>
  )
}
