"use client"

import * as React from "react"
import { MinusIcon, PlusIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

// Numeric increment/decrement control: a −/+ pair flanking a value readout.
// Controlled (value/onChange), clamps to min/max, and also responds to
// ArrowUp/ArrowDown while focused. Flat — the −/value/+ trio has no
// independent composition need.

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
  disabled?: boolean
  className?: string
}

function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  format = (v) => String(v),
  disabled = false,
  className,
}: StepperProps) {
  const atMin = value <= min
  const atMax = value >= max

  function clamp(v: number) {
    return Math.min(max, Math.max(min, v))
  }

  function decrement() {
    if (disabled || atMin) return
    onChange(clamp(value - step))
  }

  function increment() {
    if (disabled || atMax) return
    onChange(clamp(value + step))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === "ArrowUp") {
      e.preventDefault()
      increment()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      decrement()
    }
  }

  // Visuals stay a compact size-6 (24px); the hit area expands to the
  // 44px touch-target floor on coarse pointers only, via a transparent
  // pseudo-element rather than growing the rendered button.
  const buttonClass =
    "relative flex size-6 shrink-0 touch-manipulation items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary active:bg-primary/25 disabled:pointer-events-none disabled:opacity-30 pointer-coarse:before:absolute pointer-coarse:before:inset-[-10px] pointer-coarse:before:content-['']"

  return (
    <div
      data-slot="stepper"
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border bg-card p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        aria-label="decrement"
        disabled={disabled || atMin}
        onClick={decrement}
        className={buttonClass}
      >
        <MinusIcon className="size-3" />
      </button>
      <span className="min-w-8 text-center font-mono text-xs tabular-nums text-foreground">
        {format(value)}
      </span>
      <button
        type="button"
        aria-label="increment"
        disabled={disabled || atMax}
        onClick={increment}
        className={buttonClass}
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  )
}

export { Stepper }
export type { StepperProps }
