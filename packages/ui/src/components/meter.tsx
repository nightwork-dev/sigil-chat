import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import {
  normalizeTone,
  toneFillVariants,
  type ToneLike,
} from "@workspace/ui/lib/tone"

const meterTrackVariants = cva("bg-muted rounded-full overflow-hidden", {
  variants: {
    size: {
      sm: "h-1",
      md: "h-1.5",
      lg: "h-2",
    },
  },
  defaultVariants: { size: "sm" },
})

const meterFillBase = "h-full rounded-full transition-all"

interface MeterSegment {
  start: number
  duration: number
  /** Tailwind background class, e.g. "bg-chart-1". Falls back to the primary color variant. */
  colorClassName?: string
  label?: string
}

type MeterBaseProps = {
  className?: string
} & VariantProps<typeof meterTrackVariants>

type MeterValueProps = MeterBaseProps & {
    /** Fill tone — canonical (success/warning/destructive/info/muted/primary) or alias (positive/danger/…). */
    color?: ToneLike
    /** Current value */
    value: number
    /** Maximum value (default: 1) */
    max?: number
    segments?: undefined
  }

type MeterSegmentsProps = MeterBaseProps & {
  /** Proportional segments positioned within [0, span] — e.g. a multi-track timeline. */
  segments: MeterSegment[]
  /** The full span the segments are positioned within. */
  span: number
  /** Optional playhead position within [0, span]. */
  playheadAt?: number
  value?: undefined
  max?: undefined
}

export type MeterProps = MeterValueProps | MeterSegmentsProps

function Meter(props: MeterProps) {
  if (props.segments) {
    const { segments, span, playheadAt, size, className } = props
    return (
      <div data-slot="meter" className={cn(meterTrackVariants({ size }), "relative", className)}>
        {segments.map((segment, i) => (
          <div
            key={i}
            data-slot="meter-segment"
            title={segment.label}
            className={cn("absolute inset-y-0 rounded-full", segment.colorClassName ?? "bg-primary")}
            style={{
              left: `${(segment.start / span) * 100}%`,
              width: `${Math.max(0, (segment.duration / span) * 100)}%`,
            }}
          />
        ))}
        {playheadAt != null && (
          <div
            data-slot="meter-playhead"
            className="absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${(playheadAt / span) * 100}%` }}
          />
        )}
      </div>
    )
  }

  const { value, max = 1, size, color = "muted", className } = props
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  return (
    <div
      data-slot="meter"
      className={cn(meterTrackVariants({ size }), className)}
    >
      <div
        className={cn(meterFillBase, toneFillVariants({ tone: normalizeTone(color) }))}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Meter, meterTrackVariants }
export type { MeterSegment }
