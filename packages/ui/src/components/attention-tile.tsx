"use client"

// AttentionTile — the "what needs you" home tile. A single button-shaped
// surface that renders EXACTLY one of three states: live (quiet card with an
// optional count and up to three preview rows), empty (the same card with one
// quiet line), or loading (skeleton rows). The projection contract is binding:
// a count is rendered ONLY when state is live AND count is non-null — no
// aspirational numbers, ever. A loading skeleton is visually distinct from an
// empty state so "still fetching" is never mistaken for "nothing there."
//
// The tile carries NO domain vocabulary: `title`, `count`, `items` are
// display shapes. It does not know what an "inbox" or an "approval" is — the
// caller adapts its domain into these props one layer up.
//
// Flat (not compound Root/Parts): a tile is one shape, one affordance (the
// whole surface opens), not independently composed parts — the RULE 1
// exception for single-shape surfaces (compare Card, ExhibitCard).

import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Skeleton } from "@workspace/ui/components/skeleton"

export type AttentionState = "live" | "empty" | "loading"

export interface AttentionItem {
  id: string
  label: string
  meta?: string
}

export interface AttentionTileProps {
  /** Tile title (always rendered). */
  title: string
  /** Which of the three honest states to render. */
  state: AttentionState
  /**
   * Count to display. Rendered ONLY when `state === "live"` and this is
   * non-null — the projection contract. Ignored entirely for empty/loading
   * so a stale number can never leak into those states.
   */
  count?: number | null
  /** Up to ~3 preview rows, shown only when live. */
  items?: AttentionItem[]
  /** Optional leading glyph (icon). */
  glyph?: React.ReactNode
  /** Quiet line shown in the empty state. */
  emptyLabel?: string
  /** Whole-tile affordance — the entire surface is the open target. */
  onOpen: () => void
  className?: string
}

const PREVIEW_ROWS_MAX = 3

// A count is showable only under the live state — the single rule that keeps
// a number out of empty/loading. Pulled out so the projection contract has
// one tested home (the test asserts this directly), not three inline checks.
export function shouldShowCount(state: AttentionState, count: number | null | undefined): boolean {
  return count != null && count >= 0 && state === "live"
}

export function composeAccessibleName(title: string, state: AttentionState, count: number | null | undefined): string {
  if (state === "loading") return `${title}, loading`
  if (state === "empty") return `${title}, nothing waiting`
  // live
  if (shouldShowCount(state, count)) {
    const n = count as number
    return `${title}, ${n} ${n === 1 ? "item" : "items"}`
  }
  return title
}

function AttentionTile({ title, state, count, items, glyph, emptyLabel = "Nothing waiting", onOpen, className }: AttentionTileProps) {
  const showCount = shouldShowCount(state, count)
  const accessibleName = composeAccessibleName(title, state, count)
  const previews = state === "live" ? (items ?? []).slice(0, PREVIEW_ROWS_MAX) : []

  return (
    <button
      type="button"
      data-slot="attention-tile"
      data-state={state}
      onClick={onOpen}
      aria-label={accessibleName}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-2 rounded-lg bg-card p-3 text-left text-card-foreground ring-1 ring-foreground/10 transition-colors",
        "hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {glyph ? <span aria-hidden className="shrink-0 text-muted-foreground [&_svg]:size-4">{glyph}</span> : null}
          <span className="truncate">{title}</span>
        </span>
        {/* Count: tabular mono, live-only. The CVA-free single weight keeps
            the number the loudest thing in the tile without a color signal. */}
        {showCount ? (
          <span aria-hidden className="shrink-0 font-mono text-lg font-semibold tabular-nums text-foreground">
            {count}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        // Skeleton rows — visually distinct from empty (shimmer, not a
        // message) so "fetching" never reads as "none."
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: PREVIEW_ROWS_MAX }, (_, i) => (
            <Skeleton key={i} className="h-3.5 w-full last:w-2/3" />
          ))}
        </div>
      ) : state === "empty" ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : previews.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1">
          {previews.map((item) => (
            <li key={item.id} className="flex min-w-0 items-baseline gap-2 text-xs">
              <span className="truncate text-muted-foreground">{item.label}</span>
              {item.meta ? <span className="ml-auto shrink-0 font-mono text-[0.625rem] tabular-nums text-muted-foreground/80">{item.meta}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        // live but no preview rows: a single quiet line keeps the tile from
        // collapsing to just a header, without inventing content.
        <p className="text-xs text-muted-foreground">Open to review</p>
      )}
    </button>
  )
}

export { AttentionTile }
