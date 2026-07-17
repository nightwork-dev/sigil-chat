"use client"

// Click static text to reveal an input in its place. Confirms on blur/Enter,
// cancels on Escape.

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Input } from "@workspace/ui/components/input"

interface ClickToEditProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Confirm the draft on blur (default) instead of cancelling it. */
  confirmOnBlur?: boolean
  as?: "span" | "div" | "p"
  className?: string
  inputClassName?: string
}

function ClickToEdit({
  value,
  onCommit,
  placeholder = "Click to edit",
  disabled,
  confirmOnBlur = true,
  as: Tag = "span",
  className,
  inputClassName,
}: ClickToEditProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const setInputRef = React.useCallback((element: HTMLInputElement | null) => {
    inputRef.current = element
  }, [])

  React.useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = React.useCallback(() => {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }, [disabled, value])

  const commit = React.useCallback(() => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }, [draft, value, onCommit])

  const cancel = React.useCallback(() => {
    setEditing(false)
    setDraft(value)
  }, [value])

  if (editing) {
    return (
      <Input
        ref={setInputRef}
        data-slot="click-to-edit-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={confirmOnBlur ? commit : cancel}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") cancel()
        }}
        className={cn("h-auto py-0", inputClassName)}
      />
    )
  }

  return (
    <Tag
      data-slot="click-to-edit"
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          startEditing()
        }
      }}
      className={cn(
        !disabled && "cursor-pointer decoration-dotted decoration-primary hover:underline",
        !value && "text-muted-foreground italic",
        className
      )}
    >
      {value || placeholder}
    </Tag>
  )
}

export { ClickToEdit }
export type { ClickToEditProps }
