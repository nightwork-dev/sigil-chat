"use client"

// PillBar — a controlled single-select pill row built as a presentation of the
// shared ToggleGroup. Reuses Base UI's roving-focus / selection machine
// wholesale; this component adds only two things:
//   1. the pill shape (glyph + label + optional value badge, selected pill
//      reads as primary), and
//   2. horizontal-overflow handling — a scroll track that stays keyboard
//      reachable, with edge fades that appear ONLY when content exists
//      offscreen on that side (a mask, not a decorative gradient, so it is
//      theme-agnostic and tied to real scroll state).
//
// No POV / persona / selection-domain vocabulary: items are { id, label,
// glyph?, badge? } and the bar emits the selected id. A ToggleGroup toggle-off
// (clicking the active pill) is a no-op here — a pill bar selects, it does not
// deselect.

import * as React from "react"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

export interface PillItem {
  id: string
  label: React.ReactNode
  /** Optional leading glyph (icon). */
  glyph?: React.ReactNode
  /** Optional trailing value badge (a count, a status dot, etc.). */
  badge?: React.ReactNode
}

export interface PillBarProps {
  items: PillItem[]
  /** Currently-selected item id, or undefined for no selection. */
  selectedId?: string
  /** Called with the newly-selected id. Never called for a no-op (re-select / toggle-off). */
  onSelect: (id: string) => void
  className?: string
}

/**
 * Reduce a ToggleGroup value change to a pill-bar selection, or null for a
 * no-op. In single-select mode the group emits the next pressed value (or []
 * when the active item is toggled off). A pill bar treats toggle-off and
 * re-select of the current id as no-ops so the controlled `selectedId` holds.
 */
export function resolvePillSelect(
  currentSelectedId: string | undefined,
  nextGroupValue: readonly string[],
): string | null {
  const next = nextGroupValue[nextGroupValue.length - 1]
  if (next === undefined) return null
  if (next === currentSelectedId) return null
  return next
}

const FADE_PX = 10

function PillBar({ items, selectedId, onSelect, className }: PillBarProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ canLeft: false, canRight: false })

  const measure = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflow = el.scrollWidth - el.clientWidth > 1
    setEdges({
      canLeft: overflow && el.scrollLeft > 1,
      canRight: overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  // DOM measurement — measure on mount, on item-count change, and on resize.
  // The fade is derived from real scroll geometry, so it never shows when
  // nothing is offscreen.
  React.useLayoutEffect(() => {
    measure()
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [measure, items.length])

  // Mask stops: fade an edge ONLY when content is offscreen on that side.
  // Mask (not a colored gradient) so the fade tracks whatever surface the
  // bar sits on — theme-agnostic, no raw palette.
  const stops: string[] = [edges.canLeft ? "transparent" : "#000", `#000 ${FADE_PX}px`]
  if (edges.canRight) {
    stops.push(`#000 calc(100% - ${FADE_PX}px)`, "transparent")
  } else {
    stops.push("#000")
  }
  const maskImage = `linear-gradient(to right, ${stops.join(", ")})`

  return (
    <div
      className={cn(
        // Hide the scrollbar but keep scrolling + keyboard focus.
        "relative overflow-x-auto overflow-y-hidden overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      ref={scrollRef}
      onScroll={measure}
      style={{ maskImage, WebkitMaskImage: maskImage }}
      role="presentation"
    >
      <ToggleGroup
        value={selectedId ? [selectedId] : []}
        onValueChange={(group) => {
          const next = resolvePillSelect(selectedId, group)
          if (next !== null) onSelect(next)
        }}
        variant="outline"
        aria-label="Selection"
      >
        {items.map((item) => {
          const selected = item.id === selectedId
          return (
            <ToggleGroupItem
              key={item.id}
              value={item.id}
              aria-pressed={selected}
              className={cn(
                // Selected pill reads as primary (on-state), overriding the
                // toggle's default muted-pressed look. These overrides must
                // be aria-pressed:/data-[state=on]:-prefixed (not plain
                // utilities) because Tailwind emits variant-prefixed
                // utilities after plain ones in the stylesheet — the
                // toggle's own aria-pressed:bg-muted would otherwise beat a
                // plain bg-primary regardless of source order here.
                "aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80 aria-pressed:hover:text-primary-foreground data-[state=on]:border-transparent data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
              )}
            >
              {item.glyph ? (
                <span data-icon="inline-start" aria-hidden="true" className="shrink-0">
                  {item.glyph}
                </span>
              ) : null}
              <span className="truncate">{item.label}</span>
              {item.badge ? (
                <span
                  className={cn(
                    "ml-0.5 shrink-0 rounded-full px-1.5 font-mono text-[0.625rem] tabular-nums",
                    selected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}

export { PillBar }
