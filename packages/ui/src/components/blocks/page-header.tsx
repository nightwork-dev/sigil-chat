// Block: PageHeader
//
// A composed section (title + optional description + optional actions row)
// that opens a View's content region. Promoted to a Block because it is
// reused across ≥2 Views (EntityBrowserView, InboxView.Detail) — a one-off
// header would stay inline per the promotion rubric (spec §2).
//
// Decoupled: pure presentation, no router/app coupling. `actions` is a slot
// so the caller supplies whatever controls belong to its surface.

import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface PageHeaderProps {
  title: ReactNode
  /** Only for read-once surfaces (ux skill: glanceable views omit it). */
  description?: ReactNode
  /** Right-aligned controls (buttons, badges) that act on this surface. */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
