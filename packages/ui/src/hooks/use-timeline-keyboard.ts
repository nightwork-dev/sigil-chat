// Ported from the source's use-timeline-keyboard.ts — kept only the shortcuts
// that were genuinely implemented there. Dropped: ArrowLeft/ArrowRight
// ("navigate in time"), which called preventDefault() and did nothing else
// but console.log — looked wired, wasn't. Also dropped Cmd/Ctrl+C/V/D
// (copy/paste/duplicate): the hook itself had no clipboard state at all,
// only optional onCopy/onPaste/onDuplicate callback props that the one
// interactive demo exercising this hook never actually passed — so those
// shortcuts did nothing out of the box either. If real clipboard support is
// wanted later, it needs an actual implementation, not a re-added pass-
// through.

import { useEffect } from "react"

export interface UseTimelineKeyboardOptions {
  selection: string[]
  allEventIds: string[]
  onDeleteSelected: () => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  enabled?: boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
}

export function useTimelineKeyboard({ selection, allEventIds, onDeleteSelected, onSelectAll, onClearSelection, enabled = true }: UseTimelineKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return

      if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
        e.preventDefault()
        onDeleteSelected()
      } else if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault()
        onSelectAll(allEventIds)
      } else if (e.key === "Escape") {
        onClearSelection()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled, selection, allEventIds, onDeleteSelected, onSelectAll, onClearSelection])
}
