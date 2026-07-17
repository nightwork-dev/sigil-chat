// Block: PropertyPanel
//
// A composed section: the right-rail "inspector / properties" panel that a
// content surface exposes for whatever is selected — a padded vertical stack
// (`Root`) of labeled subsections (`Section`) and 2-up metric grids (`Grid`).
//
// Promoted to a Block on both rubric paths (spec §2): it is composed (≥2
// components) AND it is exactly the section a Layout slot expects — the
// InspectorShell defines an `inspector` slot with nothing to canonically fill
// it. Two real consumers rewired onto it: the CanvasView properties rail and
// the InspectorShell's inspector demo.
//
// Compound Root/Parts (the repo's mandated pattern) so the same panel composes
// differently per surface — a canvas rail (Position / Size / Layers sections)
// vs. a document inspector (form fields + a metric grid) — without a separate
// component for each.
//
// Decoupled (spec §5): pure layout, no router/app coupling. Callers drop in
// their own controls (DataLabel, Field, Switch, …); the Block owns only the
// panel's rhythm and the label-plus-body subsection idiom.

import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

interface RootProps {
  children: ReactNode
  className?: string
}

/** The panel container — consistent padding + vertical rhythm for a side rail. */
function Root({ children, className }: RootProps) {
  return (
    <div className={cn("space-y-4 p-3 text-xs", className)}>{children}</div>
  )
}

interface SectionProps {
  /** Muted micro-label opening the subsection. */
  title: ReactNode
  /** Optional leading glyph (e.g. a lucide icon element). */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/** A labeled subsection: muted label row, then its body. */
function Section({ title, icon, children, className }: SectionProps) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

interface GridProps {
  children: ReactNode
  className?: string
}

/** 2-up grid for metric readouts (DataLabel, key/value boxes). */
function Grid({ children, className }: GridProps) {
  return <div className={cn("grid grid-cols-2 gap-2", className)}>{children}</div>
}

export const PropertyPanel = { Root, Section, Grid }
