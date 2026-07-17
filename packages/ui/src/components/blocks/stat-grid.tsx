// Block: StatGrid / StatCard
//
// A composed section: a responsive grid of labeled metric cards (label +
// value + optional signed delta). Promoted to a Block because it is composed
// (Card + CardHeader + CardTitle + CardContent + delta) AND the pattern is
// designated canonical by the spec (§7 "stat card") and recurs across
// multiple compositions in this repo (the DashboardView metrics row plus the
// queue-monitoring benchmark pages). The DashboardView is the canonical
// rewired consumer; the /bench pages keep their own copies deliberately —
// they are frozen model-benchmark artifacts, not Examples to rewire.
//
// Decoupled (spec §5): pure presentation, no router/app coupling. Data enters
// as props; the delta tone is inferred from the sign of `delta` unless an
// explicit `trend` is supplied, so a caller with non-±-prefixed deltas can
// still drive the color.

import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

export interface StatGridProps {
  children: ReactNode
  className?: string
}

/** Responsive metric-card grid. Defaults to 2-up on small, 4-up from lg. */
export function StatGrid({ children, className }: StatGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {children}
    </div>
  )
}

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  /** Signed change readout, e.g. "+14.2%". Color follows its sign. */
  delta?: string
  /** Force the delta tone instead of inferring it from the sign of `delta`. */
  trend?: "up" | "down"
  className?: string
}

export function StatCard({ label, value, delta, trend, className }: StatCardProps) {
  const isUp = trend ? trend === "up" : delta?.startsWith("+")

  return (
    <Card size="sm" className={className}>
      <CardHeader className="pb-0">
        <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-medium tabular-nums">{value}</span>
          {delta ? (
            <span
              className={cn(
                "text-xs font-mono",
                isUp ? "text-success" : "text-destructive",
              )}
            >
              {delta}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
