"use client"

// PopoverEdit — a transactional inline-edit shell. The displayed value IS the
// trigger; the popover holds a label, one control slot, and an optional hint.
//
// The shell owns the transaction semantics exactly once:
//   - on open, it snapshots the committed value into a draft;
//   - the control mutates the draft via the render-prop API;
//   - on close (any reason except Escape) it commits the draft if it changed;
//   - on Escape it discards the draft and does NOT commit.
// Focus returns to the trigger after close (Base UI default). The compositions
// (PopoverEditSlider, PopoverEditSelect) wire a control to the draft API and
// must not duplicate any of this.
//
// Display-shaped and domain-free: `value: T`, `onValueChange`, `format`, and a
// label — nothing about what the value means leaks in.

import * as React from "react"
import type { ReactNode } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Button } from "@workspace/ui/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

/** Why the popover closed — Escape discards; everything else commits. */
export type PopoverEditCloseKind = "escape" | "commit"

/**
 * Decide what (if anything) to commit when the popover closes.
 *
 *   - Escape  → null (discard the draft, keep the opening value).
 *   - commit  → the draft, unless it is unchanged from the opening value
 *               (no spurious onValueChange for an untouched edit).
 *
 * Pure + generic so the render path and the Escape-rollback / close-commit
 * tests share one definition.
 */
export function resolveCommitOnClose<T>(
  kind: PopoverEditCloseKind,
  opening: T,
  draft: T,
): T | null {
  if (kind === "escape") return null
  if (Object.is(opening, draft)) return null
  return draft
}

export interface PopoverEditApi<T> {
  /** The in-flight draft (initialized to the committed value on open). */
  draft: T
  /** Replace the draft. Does not commit — commit happens on close. */
  setDraft: (next: T) => void
}

export interface PopoverEditProps<T> {
  /** The committed value. The trigger displays it; the draft snapshots it on open. */
  value: T
  /** Called with the committed draft on close (not on Escape, not when unchanged). */
  onValueChange?: (value: T) => void
  /** Render the value for the trigger. Defaults to String(value). */
  format?: (value: T) => ReactNode
  /** Label shown above the control AND used in the trigger's accessible name. */
  label: string
  /** The control, wired to the draft API. */
  children: (api: PopoverEditApi<T>) => ReactNode
  /** Optional hint shown under the control. */
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

function PopoverEdit<T>({
  value,
  onValueChange,
  format,
  label,
  children,
  hint,
  disabled,
  className,
}: PopoverEditProps<T>) {
  const [open, setOpen] = React.useState(false)
  // The draft is only meaningful while open; kept in state so the control can
  // read/write it without prop-drilling a commit through the caller.
  const [draft, setDraft] = React.useState<T>(value)
  // The opening value is captured at open time so Escape can restore it even
  // if the committed prop hasn't updated yet.
  const openingRef = React.useRef<T>(value)

  const display = format ? format(value) : String(value)

  const handleOpenChange: PopoverPrimitive.Root.Props["onOpenChange"] = (
    nextOpen,
    details,
  ) => {
    if (nextOpen) {
      openingRef.current = value
      setDraft(value)
      setOpen(true)
      return
    }
    const kind: PopoverEditCloseKind = details.reason === "escape-key" ? "escape" : "commit"
    const committed = resolveCommitOnClose(kind, openingRef.current, draft)
    if (committed !== null) onValueChange?.(committed)
    setOpen(false)
  }

  if (disabled) {
    // No popover when disabled — a quiet readout, not a dead trigger.
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
          className,
        )}
      >
        <span className="sr-only">{label}: </span>
        {display}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1 font-mono text-xs text-muted-foreground", className)}
          />
        }
      >
        {/* Accessible name: "Edit {label}, current value {value}" — the
            sr-only prefix + the visible value concatenate into the button's
            name without needing format to return a string. */}
        <span className="sr-only">Edit {label}, current value </span>
        <span>{display}</span>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto min-w-[12rem]">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          {children({ draft, setDraft })}
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { PopoverEdit }
