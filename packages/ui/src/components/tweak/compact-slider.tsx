"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"

interface CompactSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  format?: (value: number) => string
  axis?: "horizontal" | "vertical"
  /** Locked fields ignore drag — the value stays fixed until unlocked. */
  disabled?: boolean
  className?: string
}

function CompactSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step,
  label,
  format = (v) => v.toFixed(2),
  axis = "horizontal",
  disabled = false,
  className,
}: CompactSliderProps) {
  const span = max - min
  const normalized = span <= 0 ? 0 : (value - min) / span

  const { targetProps, dragging: isDragging } = useBoundedVector({
    axes: [{ min, max, step }],
    value: [value],
    onChange: (next) => onChange(next[0]!),
    mapping:
      axis === "vertical"
        ? { mode: "absolute", orientation: "y", invertY: true }
        : { mode: "absolute", orientation: "x" },
    disabled,
  })
  const { style: targetStyle, ...restTargetProps } = targetProps

  if (axis === "vertical") {
    return (
      <div
        data-slot="compact-slider"
        data-disabled={disabled}
        className={cn(
          "relative touch-none select-none overflow-hidden rounded-sm border border-border bg-card",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-ns-resize",
          className,
        )}
        style={targetStyle}
        {...restTargetProps}
      >
        {/* Fill from bottom */}
        <div
          className="absolute inset-x-0 bottom-0 rounded-sm bg-primary/25"
          style={{ height: `${normalized * 100}%` }}
        />

        {/* Fill edge */}
        {normalized > 0.005 && (
          <div
            className={cn(
              "absolute inset-x-0 h-[1.5px]",
              isDragging ? "bg-primary/80" : "bg-primary/60",
            )}
            style={{ bottom: `${normalized * 100}%` }}
          />
        )}

        {/* Value + label */}
        <div className="relative flex h-full flex-col items-center justify-between py-1">
          <span className="font-mono text-[8px] font-medium tabular-nums text-foreground">
            {format(value)}
          </span>
          <span className="truncate font-mono text-[7px] font-medium text-muted-foreground">
            {label}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      data-slot="compact-slider"
      data-disabled={disabled}
      className={cn(
        "relative h-5 touch-none select-none overflow-hidden rounded-sm border border-border bg-card",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-ew-resize",
        className,
      )}
      style={targetStyle}
      {...restTargetProps}
    >
      {/* Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-sm bg-primary/25"
        style={{ width: `${normalized * 100}%` }}
      />

      {/* Fill edge */}
      {normalized > 0.005 && (
        <div
          className={cn(
            "absolute inset-y-0 w-[1.5px]",
            isDragging ? "bg-primary/80" : "bg-primary/60",
          )}
          style={{ left: `${normalized * 100}%` }}
        />
      )}

      {/* Label + value overlay */}
      <div className="relative flex h-full items-center justify-between px-1.5">
        {label && (
          <span className="font-mono text-[9px] font-medium text-muted-foreground">
            {label}
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] font-medium tabular-nums text-foreground">
          {format(value)}
        </span>
      </div>
    </div>
  )
}

export { CompactSlider }
export type { CompactSliderProps }
