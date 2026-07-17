// Shared status → color language for any "value that can be free / bounded /
// derived / pinned / committed / conflicting" UI — range sliders, decision
// tracks, node diagrams. One mapping so it can't drift between components.
//
// DOM (Tailwind) consumers use the CVA variants. SVG consumers (node
// diagrams, geometric visualizations) use svgPaint(), which returns CSS-var
// paint + opacities instead of class strings.

import { cva } from "class-variance-authority"

export type ValueStatus =
  | "free"
  | "bounded"
  | "derived"
  | "pinned"
  | "committed"
  | "conflicting"

export interface SvgPaint {
  fill: string
  fillOpacity: number
  stroke: string
  strokeOpacity: number
  label: string
  dashed: boolean
}

export function svgPaint(status: ValueStatus): SvgPaint {
  switch (status) {
    case "pinned":
      return { fill: "var(--color-primary)", fillOpacity: 0.15, stroke: "var(--color-primary)", strokeOpacity: 1, label: "var(--color-primary)", dashed: false }
    case "committed":
      return { fill: "var(--color-chart-2)", fillOpacity: 0.12, stroke: "var(--color-chart-2)", strokeOpacity: 1, label: "var(--color-chart-2)", dashed: false }
    case "derived":
      return { fill: "var(--color-muted)", fillOpacity: 1, stroke: "var(--color-muted-foreground)", strokeOpacity: 0.4, label: "var(--color-muted-foreground)", dashed: false }
    case "bounded":
      return { fill: "var(--color-primary)", fillOpacity: 0.08, stroke: "var(--color-primary)", strokeOpacity: 0.3, label: "var(--color-foreground)", dashed: true }
    case "conflicting":
      return { fill: "var(--color-destructive)", fillOpacity: 0.12, stroke: "var(--color-destructive)", strokeOpacity: 1, label: "var(--color-destructive)", dashed: false }
    case "free":
      return { fill: "transparent", fillOpacity: 0, stroke: "var(--color-border)", strokeOpacity: 1, label: "var(--color-muted-foreground)", dashed: false }
  }
}

export const statusFillVariants = cva(
  "absolute inset-y-0 rounded-md transition-[left,width] duration-200",
  {
    variants: {
      status: {
        pinned: "bg-primary",
        committed: "bg-chart-2",
        derived: "bg-primary/70",
        bounded: "bg-primary/30",
        free: "bg-muted-foreground/15",
        conflicting: "bg-destructive/60",
      },
    },
    defaultVariants: { status: "derived" },
  }
)

export const statusTextVariants = cva("font-mono text-xs tabular-nums", {
  variants: {
    status: {
      pinned: "text-foreground",
      committed: "text-chart-2",
      derived: "text-foreground",
      bounded: "text-foreground",
      free: "text-muted-foreground",
      conflicting: "text-destructive",
    },
  },
  defaultVariants: { status: "derived" },
})

export const statusAccentVariants = cva("", {
  variants: {
    status: {
      pinned: "border-l-2 border-primary",
      committed: "border-l-2 border-chart-2",
      derived: "border-l-2 border-muted-foreground/40",
      bounded: "",
      free: "",
      conflicting: "",
    },
  },
  defaultVariants: { status: "derived" },
})
