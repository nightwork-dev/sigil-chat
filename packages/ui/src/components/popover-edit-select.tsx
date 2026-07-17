"use client"

// PopoverEditSelect — a string-valued PopoverEdit over a fixed option list.
// The shell owns the transaction (open snapshots, close commits, Escape
// discards); this composition only wires the options to the draft API.
//
// Implemented with an inline RadioGroup rather than a popup Select on purpose:
// a Select is itself a popover, and nesting one popup inside the
// transaction-Popover risks an outside-press race (picking an option would
// close the outer popover before the selection lands). An inline radio list
// has no second popup, so the shell's commit-on-close / discard-on-Escape
// contract holds by construction.

import type { ReactNode } from "react"
import { PopoverEdit } from "@workspace/ui/components/popover-edit"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

export interface PopoverEditOption {
  value: string
  label: ReactNode
}

export interface PopoverEditSelectProps {
  value: string
  onValueChange?: (value: string) => void
  label: string
  options: PopoverEditOption[]
  /** Format the value for the trigger. Defaults to the matched option's label. */
  format?: (value: string) => ReactNode
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

function defaultFormat(options: PopoverEditOption[]): (value: string) => ReactNode {
  return (value) => options.find((o) => o.value === value)?.label ?? value
}

function PopoverEditSelect({
  value,
  onValueChange,
  label,
  options,
  format,
  hint,
  disabled,
  className,
}: PopoverEditSelectProps) {
  return (
    <PopoverEdit<string>
      value={value}
      onValueChange={onValueChange}
      label={label}
      format={format ?? defaultFormat(options)}
      hint={hint}
      disabled={disabled}
      className={className}
    >
      {({ draft, setDraft }) => (
        <RadioGroup
          value={draft}
          onValueChange={(next) => setDraft(next as string)}
          className="flex flex-col gap-1"
        >
          {options.map((option) => (
            // <label> wraps a labelable <button role="radio">, so clicking the
            // text selects the radio without a second pointer handler.
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-xs"
            >
              <RadioGroupItem value={option.value} />
              <span>{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      )}
    </PopoverEdit>
  )
}

export { PopoverEditSelect }
