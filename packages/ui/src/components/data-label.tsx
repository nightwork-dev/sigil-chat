import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

// Read-only key:value pair — muted label, mono/foreground value. The
// display-only counterpart to KeyValueEditor (key-value-editor.tsx), which
// is for *editing* a bag of named strings. This component never edits
// anything; don't merge the two.

interface DataLabelProps {
  label: ReactNode
  value: ReactNode
  /** "inline" (default) puts label and value on one line; "stacked" puts the value on its own line below. */
  orientation?: "inline" | "stacked"
  className?: string
}

function DataLabel({ label, value, orientation = "inline", className }: DataLabelProps) {
  if (orientation === "stacked") {
    return (
      <div data-slot="data-label" className={cn("flex flex-col gap-0.5", className)}>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-sm text-foreground">{value}</span>
      </div>
    )
  }

  return (
    <div
      data-slot="data-label"
      className={cn("flex items-baseline justify-between gap-3", className)}
    >
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  )
}

export { DataLabel }
export type { DataLabelProps }
