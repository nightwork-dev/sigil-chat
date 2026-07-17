"use client"

import { cn } from "@workspace/ui/lib/utils"
import {
  useThemeColors,
  resolveCanvasColor,
} from "@workspace/ui/hooks/use-theme-colors"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"

export interface FaderProps {
  /** Display label below the fader */
  label: string
  /** Normalized value 0-1 */
  value: number
  /** Called with new value on drag */
  onChange: (value: number) => void
  /** Track width in pixels (default 28) */
  width?: number
  /** Track height in pixels (default 120) */
  height?: number
  /** Override accent color (CSS color string) */
  tint?: string
  className?: string
}

const TICKS = [0, 0.25, 0.5, 0.75, 1.0]
const CAP_H = 8

export function Fader({
  label,
  value,
  onChange,
  width = 28,
  height = 120,
  tint,
  className,
}: FaderProps) {
  const tc = useThemeColors()

  const accentColor = tint ? resolveCanvasColor(tint) : tc.primary

  const capY = height * (1 - value) - CAP_H / 2
  const clampedCapY = Math.max(-CAP_H / 2, Math.min(height - CAP_H / 2, capY))
  const fillH = Math.max(0, height * value)

  const { targetProps } = useBoundedVector({
    axes: [{ min: 0, max: 1 }],
    value: [value],
    onChange: (next) => onChange(next[0]!),
    mapping: { mode: "absolute", orientation: "y", invertY: true },
  })
  const { style: targetStyle, ...restTargetProps } = targetProps

  return (
    <div
      data-slot="fader"
      className={cn("inline-flex flex-col items-center gap-1", className)}
    >
      <div
        className="relative touch-none cursor-ns-resize"
        style={{ width, height, ...targetStyle }}
        {...restTargetProps}
      >
        {/* Track groove */}
        <div
          className="absolute rounded-sm bg-muted"
          style={{
            width: 4,
            height,
            left: (width - 4) / 2,
            top: 0,
          }}
        />

        {/* Fill below cap */}
        <div
          className="absolute rounded-sm"
          style={{
            width: 4,
            height: fillH,
            left: (width - 4) / 2,
            bottom: 0,
            backgroundColor: accentColor,
            opacity: 0.2,
          }}
        />

        {/* Scale ticks */}
        {TICKS.map((tick) => {
          const y = height * (1 - tick)
          return (
            <div
              key={tick}
              className="absolute bg-border"
              style={{
                width: 6,
                height: 0.5,
                left: (width - 4) / 2 - 3,
                top: y,
              }}
            />
          )
        })}

        {/* Cap / thumb */}
        <div
          className="absolute rounded-sm transition-colors"
          style={{
            width,
            height: CAP_H,
            top: clampedCapY,
            left: 0,
            backgroundColor: tc.foreground,
          }}
        />
      </div>

      <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground leading-none">
        {label}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  )
}
