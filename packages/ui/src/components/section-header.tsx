import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

// Uppercase, letter-tracked, monospaced label used to head off a group of
// controls or content — the instrument-panel equivalent of an <h3>. Purely
// presentational; no state, no parts, so it stays a flat function.

interface SectionHeaderProps {
  children: ReactNode
  /** Right-aligned slot — a count, a button, a status readout. */
  action?: ReactNode
  className?: string
}

function SectionHeader({ children, action, className }: SectionHeaderProps) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex items-center justify-between gap-2", className)}
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </span>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export { SectionHeader }
export type { SectionHeaderProps }
