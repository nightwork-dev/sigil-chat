"use client"

// ReviewMinimap — a sticky document-scroll rail (a "picture" of a long
// document) with typed review markers in the gutter. Blocks render the shape
// of the content (heading/prose/scene-break/…); markers flag changed/new/
// deleted/annotation positions; a viewport box tracks what's on screen. Drag
// or key the rail to scroll the whole document.
//
// Presentational + props-driven: positions/heights/markers are caller-computed
// 0..1 values — it knows nothing about what the document IS. Colors are
// SEMANTIC tokens (changed→warning, new→success, deleted→destructive,
// annotation→primary), not raw palette, so the gutter reads across themes.

import { forwardRef, useRef, type ComponentProps, type KeyboardEvent, type PointerEvent } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"
import { scrollDocumentFromTrackPointer, scrollDocumentToPct, useMinimapViewport } from "./review-minimap/use-minimap-viewport"

export type ReviewMarkerKind = "changed" | "new" | "deleted" | "annotation"
export type MinimapBlockKind = "heading" | "prose" | "scene-break" | "stage-note" | "blockquote"

export interface ReviewMarker {
  id: string
  kind: ReviewMarkerKind
  label: string
  targetId: string
  position: number
  count?: number
}

export interface MinimapBlock {
  id: string
  targetId: string
  position: number
  height: number
  width: number
  kind: MinimapBlockKind
}

const minimapRootVariants = cva("sticky top-8 hidden h-[calc(100vh-2.5rem)] p-0 xl:block", {
  variants: {
    density: {
      compact: "w-9",
      comfortable: "w-11",
    },
  },
  defaultVariants: {
    density: "compact",
  },
})

const minimapTrackVariants = cva(
  "relative h-full cursor-grab touch-none overflow-hidden rounded-sm bg-transparent active:cursor-grabbing",
  {
    variants: {
      density: {
        compact: "w-8",
        comfortable: "w-10",
      },
    },
    defaultVariants: {
      density: "compact",
    },
  },
)

const minimapBlockVariants = cva(
  "absolute left-1.5 rounded-sm bg-muted-foreground/18 transition-colors hover:bg-muted-foreground/35",
  {
    variants: {
      kind: {
        heading: "bg-foreground/30",
        prose: "bg-muted-foreground/18",
        "scene-break": "left-1/2 h-px -translate-x-1/2 bg-border",
        "stage-note": "bg-muted-foreground/12 italic",
        blockquote: "bg-muted-foreground/22",
      },
    },
    defaultVariants: {
      kind: "prose",
    },
  },
)

const minimapMarkerVariants = cva(
  "absolute right-0 h-1 w-2.5 rounded-l-sm shadow-sm transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  {
    variants: {
      // Semantic tokens, not raw palette: the marker's meaning drives its tone.
      kind: {
        changed: "bg-warning",
        new: "bg-success",
        deleted: "bg-destructive",
        annotation: "bg-primary",
      },
    },
    defaultVariants: {
      kind: "changed",
    },
  },
)

const minimapViewportVariants = cva(
  "pointer-events-none absolute inset-x-0 rounded-sm border border-primary/50 bg-primary/8 shadow-[0_0_0_1px_var(--border)]",
)

function clampPct(value: number, max = 100) {
  return Math.max(0, Math.min(max, value))
}

export function ReviewMinimap({
  blocks,
  markers,
  onSelect,
  density = "compact",
  className,
}: {
  blocks: MinimapBlock[]
  markers: ReviewMarker[]
  onSelect: (targetId: string) => void
  className?: string
} & VariantProps<typeof minimapRootVariants>) {
  const viewport = useMinimapViewport()
  const trackRef = useRef<HTMLDivElement | null>(null)

  const scrollFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track) return
    scrollDocumentFromTrackPointer(event.clientY, track)
  }

  const scrollFromKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = viewport.top / 100
    if (event.key === "Home") {
      event.preventDefault()
      scrollDocumentToPct(0)
    } else if (event.key === "End") {
      event.preventDefault()
      scrollDocumentToPct(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      scrollDocumentToPct(current - 0.04)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      scrollDocumentToPct(current + 0.04)
    } else if (event.key === "PageUp") {
      event.preventDefault()
      scrollDocumentToPct(current - 0.18)
    } else if (event.key === "PageDown") {
      event.preventDefault()
      scrollDocumentToPct(current + 0.18)
    }
  }

  if (blocks.length === 0) return null

  return (
    <ReviewMinimapRoot density={density} className={className}>
      <ReviewMinimapTrack
        ref={trackRef}
        density={density}
        role="scrollbar"
        tabIndex={0}
        aria-label="Text minimap scroll control"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(viewport.top)}
        onKeyDown={scrollFromKey}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrollFromPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return
          scrollFromPointer(event)
        }}
      >
        {blocks.map((block) => (
          <ReviewMinimapBlock key={block.id} block={block} />
        ))}
        {markers.map((marker) => (
          <ReviewMinimapMarker key={marker.id} marker={marker} onSelect={onSelect} />
        ))}
        <ReviewMinimapViewport top={viewport.top} height={viewport.height} />
      </ReviewMinimapTrack>
      <div className="sr-only">
        Text minimap with viewport and {markers.length} review markers. Drag the minimap to scroll.
      </div>
    </ReviewMinimapRoot>
  )
}

function ReviewMinimapRoot({
  density,
  className,
  ...props
}: ComponentProps<"aside"> & VariantProps<typeof minimapRootVariants>) {
  return <aside aria-label="Text minimap" className={cn(minimapRootVariants({ density, className }))} {...props} />
}

const ReviewMinimapTrack = forwardRef<HTMLDivElement, ComponentProps<"div"> & VariantProps<typeof minimapTrackVariants>>(
  function ReviewMinimapTrack({ density, className, ...props }, ref) {
    return <div ref={ref} data-review-minimap="text-map" className={cn(minimapTrackVariants({ density, className }))} {...props} />
  },
)

function ReviewMinimapBlock({ block }: { block: MinimapBlock }) {
  return (
    <div
      aria-hidden
      className={cn(minimapBlockVariants({ kind: block.kind }))}
      style={{
        top: `${clampPct(block.position * 100, 99)}%`,
        height: `${Math.max(0.22, block.height)}%`,
        width: `${Math.max(18, block.width * 44)}px`,
      }}
    />
  )
}

function ReviewMinimapMarker({ marker, onSelect }: { marker: ReviewMarker; onSelect: (targetId: string) => void }) {
  return (
    <button
      type="button"
      title={marker.label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => onSelect(marker.targetId)}
      className={cn(minimapMarkerVariants({ kind: marker.kind }))}
      style={{ top: `${clampPct(marker.position * 100, 98)}%` }}
    >
      <span className="sr-only">{marker.label}</span>
    </button>
  )
}

function ReviewMinimapViewport({ top, height }: { top: number; height: number }) {
  return <div aria-hidden className={cn(minimapViewportVariants())} style={{ top: `${top}%`, height: `${height}%` }} />
}
