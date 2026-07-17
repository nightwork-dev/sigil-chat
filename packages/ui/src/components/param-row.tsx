import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

// The "label … control" layout wrapper instrument panels use for a single
// tweakable parameter — label on the left, an optional value readout, the
// control itself on the right. children IS the control; this component only
// lays it out.

interface ParamRowProps {
  label: ReactNode
  /** Optional readout shown between the label and the control. */
  value?: ReactNode
  children: ReactNode
  className?: string
}

function ParamRow({ label, value, children, className }: ParamRowProps) {
  return (
    <div
      data-slot="param-row"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {value !== undefined && (
          <span className="font-mono text-xs tabular-nums text-foreground">{value}</span>
        )}
        {children}
      </div>
    </div>
  )
}

export { ParamRow }
export type { ParamRowProps }
