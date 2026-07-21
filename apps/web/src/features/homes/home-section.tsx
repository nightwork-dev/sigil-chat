// HomeSection — the composition unit every home is built from: a titled
// group of rows with keyboard semantics that match the proposal (§4):
//
// - Tab enters the list once (roving tabindex); arrow keys move within it.
// - Home/End jump to the edges.
// - Rows are real links/buttons, so Enter activates and the focus ring is
//   always visible.
// - Sections with no rows render an EmptySection, never a blank gap.

import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { SectionHeader } from "@workspace/ui/components/section-header"
import { cn } from "@workspace/ui/lib/utils"

import { EmptySection } from "./home-states"

export interface HomeSectionProps {
  readonly title: string
  readonly count?: number
  readonly empty: string
  readonly emptyAction?: string
  readonly children: ReactNode
  /** Compact density (mobile) — tighter rows, no descriptions. */
  readonly compact?: boolean
}

export function HomeSection({
  title,
  count,
  empty,
  emptyAction,
  children,
  compact,
}: HomeSectionProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const hasRows = count !== 0

  // Exactly one tabbable row per list, always. The `first` prop covers the
  // common case at render; this normalizes the rest — a leading restricted
  // row (not a [data-home-row]), or a row set that changed after mount.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>("[data-home-row]"),
    )
    if (rows.length === 0) return
    if (rows.some((row) => row.tabIndex === 0)) return
    rows[0].tabIndex = 0
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current
    if (!list) return
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>("[data-home-row]"),
    )
    if (rows.length === 0) return
    const current = rows.indexOf(document.activeElement as HTMLElement)
    let next: number | undefined
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = current < 0 ? 0 : (current + 1) % rows.length
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = current < 0 ? rows.length - 1 : (current - 1 + rows.length) % rows.length
    } else if (event.key === "Home") {
      next = 0
    } else if (event.key === "End") {
      next = rows.length - 1
    }
    if (next === undefined) return
    event.preventDefault()
    rows.forEach((row, index) => {
      row.tabIndex = index === next ? 0 : -1
    })
    rows[next].focus()
  }

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionHeader
        action={
          hasRows && count !== undefined ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {count}
            </span>
          ) : undefined
        }
      >
        {title}
      </SectionHeader>
      {hasRows ? (
        <div
          ref={listRef}
          role="list"
          aria-label={title}
          onKeyDown={onKeyDown}
          className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1")}
        >
          {children}
        </div>
      ) : (
        <EmptySection message={empty} action={emptyAction} />
      )}
    </section>
  )
}
