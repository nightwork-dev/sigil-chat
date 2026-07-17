"use client"

// PopoverEditSlider — a number-valued PopoverEdit. The shell owns the
// transaction (open snapshots, close commits, Escape discards); this
// composition only wires a Slider to the draft API. No duplicated semantics.

import type { ReactNode } from "react"
import { PopoverEdit } from "@workspace/ui/components/popover-edit"
import { Slider } from "@workspace/ui/components/slider"

export interface PopoverEditSliderProps {
  value: number
  onValueChange?: (value: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  /** Format the value for the trigger. Defaults to String(value). */
  format?: (value: number) => ReactNode
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

function PopoverEditSlider({
  value,
  onValueChange,
  label,
  min = 0,
  max = 100,
  step = 1,
  format,
  hint,
  disabled,
  className,
}: PopoverEditSliderProps) {
  return (
    <PopoverEdit<number>
      value={value}
      onValueChange={onValueChange}
      label={label}
      format={format}
      hint={hint}
      disabled={disabled}
      className={className}
    >
      {({ draft, setDraft }) => (
        <Slider
          min={min}
          max={max}
          step={step}
          value={[draft]}
          // Base UI Slider emits a number for a single-thumb slider; guard the
          // array form the primitive also accepts so the draft stays a number.
          onValueChange={(next) => setDraft(Array.isArray(next) ? next[0]! : next)}
        />
      )}
    </PopoverEdit>
  )
}

export { PopoverEditSlider }
