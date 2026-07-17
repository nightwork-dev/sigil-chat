// SegmentViz — a sum (`total = Σ parts`) drawn as a labeled stack of range
// bars on one shared [0, max] scale: the total on top, then each part below.
// Every bar is a RangeTrack, so a part pinned/derived to a point reads as a
// solid fill and a part still holding a range reads as a band — you see, at
// a glance, how much room each part still has within the total.

import { cn } from "@workspace/ui/lib/utils"
import { fmtRange, type Range } from "@workspace/ui/lib/range"
import { statusTextVariants, type ValueStatus } from "@workspace/ui/lib/value-status"
import { RangeTrack } from "@workspace/ui/components/display/range-track"

interface Part {
  label: string
  value: Range
  status: ValueStatus
}

interface SegmentVizProps {
  total: { value: Range; status: ValueStatus }
  parts: Array<Part>
  max: number
  className?: string
}

function Bar({ label, value, status, domain }: Part & { domain: [number, number] }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
        <span className={cn(statusTextVariants({ status }))}>{fmtRange(value)}</span>
      </div>
      <RangeTrack value={value} domain={domain} status={status} showLabels={false} />
    </div>
  )
}

function SegmentViz({ total, parts, max, className }: SegmentVizProps) {
  const domain: [number, number] = [0, max]
  return (
    <div data-slot="segment-viz" className={cn("space-y-2.5", className)}>
      <Bar label="total" value={total.value} status={total.status} domain={domain} />
      <div className="h-px bg-border" />
      {parts.map((p, i) => (
        <Bar key={`${p.label}-${i}`} label={p.label} value={p.value} status={p.status} domain={domain} />
      ))}
    </div>
  )
}

export { SegmentViz }
export type { SegmentVizProps }
