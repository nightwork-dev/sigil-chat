"use client"

// Pin a value, see what's still valid.
//
// Renders a track with two possible zones: an invalid/pinned span (the value
// currently asked for, which conflicts with other constraints) and a valid/
// feasible span (the range that would actually work). Pair with CommitHandle
// to let the user drag into the feasible zone and commit.
//
//   <RangeFeasibility.Root domain={[0, 100]}>
//     <RangeFeasibility.Label>Radius</RangeFeasibility.Label>
//     <RangeFeasibility.Track>
//       <RangeFeasibility.Zone variant="invalid" lo={70} hi={100} />
//       <RangeFeasibility.Zone variant="valid" lo={20} hi={60} />
//       <RangeFeasibility.Handle lo={20} hi={60} committed={42} onCommit={...} onClear={...} />
//     </RangeFeasibility.Track>
//     <RangeFeasibility.Readout lo={20} hi={60} format={(v) => v.toFixed(0)} />
//   </RangeFeasibility.Root>

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import { CommitHandle, type CommitHandleProps } from "@workspace/ui/components/constraints/commit-handle"

interface RangeFeasibilityContextValue {
  domain: [number, number]
}

const RangeFeasibilityContext = React.createContext<RangeFeasibilityContextValue | null>(null)

function useRangeFeasibility() {
  const ctx = React.useContext(RangeFeasibilityContext)
  if (!ctx) {
    throw new Error("RangeFeasibility parts must be used within <RangeFeasibility.Root>")
  }
  return ctx
}

function pctOf(v: number, domain: [number, number]): number {
  const [min, max] = domain
  return max <= min ? 0 : Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

function Root({
  domain,
  className,
  children,
}: {
  domain: [number, number]
  className?: string
  children: React.ReactNode
}) {
  return (
    <RangeFeasibilityContext.Provider value={{ domain }}>
      <div data-slot="range-feasibility" className={cn("flex items-center gap-2", className)}>
        {children}
      </div>
    </RangeFeasibilityContext.Provider>
  )
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      data-slot="range-feasibility-label"
      className={cn("w-12 shrink-0 font-mono text-[10px] text-muted-foreground", className)}
    >
      {children}
    </span>
  )
}

function Track({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="range-feasibility-track"
      className={cn("relative h-2 flex-1 overflow-hidden rounded-sm bg-muted", className)}
    >
      {children}
    </div>
  )
}

const zoneVariants = cva("absolute inset-y-0", {
  variants: {
    variant: {
      valid: "bg-primary/85",
      invalid: "bg-destructive/55",
    },
  },
  defaultVariants: { variant: "valid" },
})

function Zone({
  lo,
  hi,
  variant,
  className,
}: { lo: number; hi: number } & VariantProps<typeof zoneVariants> & { className?: string }) {
  const { domain } = useRangeFeasibility()
  const left = pctOf(lo, domain)
  const width = Math.max(1.5, pctOf(hi, domain) - left)
  return (
    <div
      data-slot="range-feasibility-zone"
      className={cn(zoneVariants({ variant }), className)}
      style={{ left: `${left}%`, width: `${width}%` }}
    />
  )
}

function Handle(props: Omit<CommitHandleProps, "domain">) {
  const { domain } = useRangeFeasibility()
  return <CommitHandle {...props} domain={domain} />
}

function Readout({
  lo,
  hi,
  format = (v: number) => v.toFixed(2),
  className,
}: {
  /** Feasible range, or undefined/null if no value would satisfy the constraints (⊥). */
  lo?: number
  hi?: number
  format?: (value: number) => string
  className?: string
}) {
  const text =
    lo == null || hi == null
      ? "→ ⊥"
      : Math.abs(hi - lo) < 0.01
        ? `→ ${format((lo + hi) / 2)}`
        : `→ [${format(lo)}, ${format(hi)}]`
  return (
    <span
      data-slot="range-feasibility-readout"
      className={cn("w-28 shrink-0 font-mono text-[10px] tabular-nums text-primary", className)}
    >
      {text}
    </span>
  )
}

const RangeFeasibility = { Root, Label, Track, Zone, Handle, Readout }

export { RangeFeasibility }
