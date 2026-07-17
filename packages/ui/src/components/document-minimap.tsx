"use client"

// A right-rail (or anywhere) document overview: a thin vertical track with
// caller-styled markers at 0..1 positions and an optional viewport window.
// The ONE generic minimap — the marker/kind/viewport contract is
// deliberately free of any domain vocabulary (review comments, prose
// sections, etc.) so a review surface and a prose reader can both consume
// it unchanged; every kind is caller-injected via `kindStyles`, none baked in.
//
// Flat (not compound Root/Parts): the track, markers, and viewport are
// absolutely-positioned children of one surface, not independently composable
// in different layouts — the RULE 1 exception for single-shape surfaces
// (like `Meter`). The A11y-critical work — markers focusable in document
// order, each announced, the map supplementary to real navigation — is
// baked in, not opt-in.

import { useRef, type PointerEvent as ReactPointerEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  centerBand,
  clampBandStart,
  normalizeViewport,
  pointerToFraction,
  positionToPercent,
  sortByPosition,
  type MinimapMarker,
  type MinimapViewport,
} from "@workspace/ui/lib/minimap"

export type { MinimapMarker, MinimapViewport } from "@workspace/ui/lib/minimap"

/** Caller-defined visual style for one marker `kind`. No kinds are baked in. */
export interface DocumentMinimapKindStyle {
  /** Design-token Tailwind classes (bg-/text-/border-) for markers of this kind. */
  className: string
  /** Optional single glyph/character rendered inside the marker's hit area. */
  glyph?: string
}

export interface DocumentMinimapProps {
  /** Markers to render. Order is irrelevant — they are sorted into document order. */
  markers: MinimapMarker[]
  /** Visual style per `kind`. A marker whose kind is absent gets the neutral fallback. */
  kindStyles: Record<string, DocumentMinimapKindStyle>
  /** The currently-visible window over the document (0..1). Omit to hide the indicator. */
  viewport?: MinimapViewport
  /** Called with a marker's id when it is activated (click or keyboard). */
  onJump: (id: string) => void
  /**
   * When provided, the viewport band becomes a draggable brush: dragging
   * translates it (span preserved — it never resizes), clamped to [0,1].
   * Pointer-down on empty track (not a marker) re-centers the band at that
   * point first, then continues the drag from there (scrubber convention).
   * The component only EMITS the intended window — it never scrolls
   * anything itself; the caller scrolls and feeds the resulting `viewport`
   * back in as a prop, the same controlled idiom as every other Sigil
   * input. Omit for today's display-only band — zero behavior change.
   */
  onViewportChange?: (viewport: MinimapViewport) => void
  className?: string
}

// Neutral fallback for a kind the caller forgot to style — still legible, no
// domain color baked in (muted-foreground is a theme token, not a signal).
const NEUTRAL_MARKER_STYLE: DocumentMinimapKindStyle = {
  className: "bg-muted-foreground/55 hover:bg-muted-foreground/85",
}

function DocumentMinimap({ markers, kindStyles, viewport, onJump, onViewportChange, className }: DocumentMinimapProps) {
  // Sort into document/focus order once per render. The acceptance ceiling is
  // 500 markers (~5000 comparisons, sub-millisecond); the array identity only
  // changes when `markers` does, so re-render cost tracks prop changes, not
  // frame rate. Inline pure call — no memoization without a measured cost.
  const ordered = sortByPosition(markers)
  const band = normalizeViewport(viewport)
  const interactive = Boolean(onViewportChange) && band !== null

  const trackRef = useRef<HTMLDivElement>(null)
  // Ephemeral drag-session state — NOT React state, since it changes on
  // every pointermove and never needs to trigger a render on its own (each
  // `onViewportChange` call already re-renders via the caller's prop).
  const dragRef = useRef<{ pointerId: number; span: number; offset: number } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !band || !onViewportChange) return
    // A marker button handles its own click — don't hijack it into a brush drag.
    if ((e.target as HTMLElement).closest("button")) return
    const track = trackRef.current
    if (!track) return

    const rect = track.getBoundingClientRect()
    const fraction = pointerToFraction(e.clientY, rect.top, rect.height)
    const span = band.end - band.start
    const grabbedBand = (e.target as HTMLElement).closest('[data-slot="minimap-band"]') !== null

    if (grabbedBand) {
      // Direct grab on the band itself: preserve where inside the band the
      // pointer landed, so the drag translates from there (no jump).
      const offset = Math.max(0, Math.min(fraction - band.start, span))
      dragRef.current = { pointerId: e.pointerId, span, offset }
    } else {
      // Empty-track click: scrubber convention — jump the band to center on
      // the click point immediately, then drag continues from its center.
      onViewportChange(centerBand(fraction, span))
      dragRef.current = { pointerId: e.pointerId, span, offset: span / 2 }
    }

    try {
      track.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already released or element detached — degrade; the drag
      // still tracks while the pointer remains over the track.
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !onViewportChange) return
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const fraction = pointerToFraction(e.clientY, rect.top, rect.height)
    onViewportChange(clampBandStart(fraction - drag.offset, drag.span))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      trackRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // Already released or detached — nothing to release.
    }
  }

  return (
    <nav aria-label="Document overview" className={cn("relative h-full w-full", className)}>
      <div
        ref={trackRef}
        className="relative h-full w-full overflow-hidden rounded-sm bg-muted/30"
        style={interactive ? { touchAction: "none" } : undefined}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? endDrag : undefined}
        onPointerCancel={interactive ? endDrag : undefined}
      >
        {ordered.map((marker) => (
          <MinimapMarkerButton
            key={marker.id}
            marker={marker}
            style={kindStyles[marker.kind] ?? NEUTRAL_MARKER_STYLE}
            onJump={onJump}
          />
        ))}

        {band && (
          <div
            aria-hidden
            data-slot="minimap-band"
            className={cn(
              "absolute inset-x-0 rounded-sm border border-primary/45 bg-primary/10",
              interactive ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
            )}
            style={{
              top: `${positionToPercent(band.start)}%`,
              bottom: `${100 - positionToPercent(band.end)}%`,
              // Presentation-only floor: a long document can produce a band a
              // few px tall (unreadable, ungrabbable). This only affects the
              // rendered box — the drag math above and the emitted viewport
              // both stay derived from the true fractional span, never from
              // this floor.
              minHeight: "10px",
            }}
          />
        )}
      </div>
      <p className="sr-only">
        Document overview with {ordered.length} marker{ordered.length === 1 ? "" : "s"}. Tab to focus a marker, then Enter to jump to it.
        {interactive ? " The viewport band can be dragged to scrub the document." : ""}
      </p>
    </nav>
  )
}

function MinimapMarkerButton({
  marker,
  style,
  onJump,
}: {
  marker: MinimapMarker
  style: DocumentMinimapKindStyle
  onJump: (id: string) => void
}) {
  const percent = positionToPercent(marker.position)
  const label = marker.label?.trim() || `Marker at ${Math.round(percent)} percent`

  return (
    <button
      type="button"
      title={marker.label}
      onClick={() => onJump(marker.id)}
      aria-label={label}
      style={{ top: `${percent}%` }}
      className={cn(
        // Pin to the right edge of the rail (the conventional marker gutter).
        // The base gives shape + hit area + focus ring; the kind className
        // layers color/glyph on top so caller styles win without fighting base.
        "absolute right-0 z-10 flex h-1.5 w-2.5 items-center justify-center rounded-l-sm outline-none",
        "transition-colors focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring/60",
        style.className,
      )}
    >
      {style.glyph ? <span aria-hidden className="font-mono text-[7px] leading-none text-inherit">{style.glyph}</span> : null}
    </button>
  )
}

export { DocumentMinimap }
