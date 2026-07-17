import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

/**
 * Sticky detail panel for two-column list+detail layouts.
 *
 * Left side: scrollable list (caller manages).
 * Right side: this component — sticky, shows detail for selected item.
 *
 * Usage:
 *   <div className="grid grid-cols-[1fr_360px] gap-4">
 *     <div>...scrollable list...</div>
 *     <DetailPanel>
 *       <DetailPanel.Header>
 *         <h2>{item.name}</h2>
 *       </DetailPanel.Header>
 *       <DetailPanel.Section title="Properties">
 *         ...
 *       </DetailPanel.Section>
 *     </DetailPanel>
 *   </div>
 */

function DetailPanelRoot({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="detail-panel"
      className={cn(
        "sticky top-4 space-y-4 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      {children}
    </div>
  )
}

function DetailPanelHeader({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="detail-panel-header"
      className={cn("space-y-1", className)}
    >
      {children}
    </div>
  )
}

function DetailPanelSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div data-slot="detail-panel-section" className={cn("space-y-2", className)}>
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

function DetailPanelEmpty({
  children = "Select an item to view details",
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="detail-panel"
      className={cn(
        "sticky top-4 flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}

export const DetailPanel = {
  Root: DetailPanelRoot,
  Header: DetailPanelHeader,
  Section: DetailPanelSection,
  Empty: DetailPanelEmpty,
}
