"use client"

// Timeline/gantt, built after a full architecture survey of prior art.
// Scoped down deliberately — see
// lib/timeline/types.ts, store.ts, and layout.ts for what was cut and why
// (relative events, the dead scaling.ts module, the "views"/"lanes" data
// models that were declared but never wired to real layout, the fake
// arrow-key/clipboard keyboard shortcuts). What's kept and real: the
// zoom-to-cursor scroll/zoom math, the drag-to-move/resize state machine,
// the vertical-drag-to-link-as-child gesture overload, the minimap's
// click-to-jump/drag-pan/edge-resize interactions, and the greedy lane-
// packing algorithm — all confirmed genuinely wired in the source, not
// just declared.
//
// TimelineEvent renders in two real compositions — the draggable bar/point
// on the main canvas, and a small marker on the minimap — so it gets an
// (internal-only, not publicly exported) Root/Visual compound, same
// pattern as VectorShape in vector-editor.tsx.

import { createContext, useContext, useMemo, useRef, useState } from "react"
import { useHotkey } from "@tanstack/react-hotkeys"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { createTimelineStore, resolvedWindowOf, selectEvents, selectMeta, selectRelationships, type DragMode, type NodeRenderMeta } from "@workspace/ui/lib/timeline/store"
import { TimelineInspector } from "@workspace/ui/components/timeline-inspector"
import { Button } from "@workspace/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import type { AbsoluteSchedule, BoundsMode, NodeAdjustment, Quantum, Schedule, TimeContextProvider, TrimPolicy } from "@workspace/ui/lib/timeline/schedule/types"
import { calculateEventLayout, getLaneYPosition, calculateTimelineHeight, LANE_HEIGHT, type LayoutEvent } from "@workspace/ui/lib/timeline/layout"
import { createTimeScale } from "@workspace/ui/lib/timeline/scale"
import { eventTimeRange, type TimelineEvent, type TimelineRelationship } from "@workspace/ui/lib/timeline/types"
import { computeSeriesShadows, type ShadowInstance } from "@workspace/ui/lib/timeline/shadows"
import { useTimelineScroll } from "@workspace/ui/hooks/use-timeline-scroll"
import { useTimelineKeyboard } from "@workspace/ui/hooks/use-timeline-keyboard"
import { useElementWidth } from "@workspace/ui/hooks/use-element-width"
import { useTimelineEventDrag, ambientGridMs, ghostExtensions, type GhostRect } from "@workspace/ui/hooks/use-timeline-event-drag"
import { useTimelineOccurrenceDrag, type OccurrenceRef, type PendingOccurrenceMove } from "@workspace/ui/hooks/use-timeline-occurrence-drag"
import { useMinimapDrag } from "@workspace/ui/hooks/use-minimap-drag"

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// Occurrence accessors need a time-context provider; legacy/demo timelines are
// wall-clock, and shadow positions never read "now", so a plain clock suffices.
const WALL_CLOCK_PROVIDER: TimeContextProvider = { currentValue: () => Date.now() }

/** Overrun magnitude formatted for the conflict badge (§2.1): +2h, +1.5d, ∞ for an unbounded overflow. */
function formatOverrun(overrun: number | null): string {
  if (overrun === null) return "∞"
  const abs = Math.abs(overrun)
  const unit = (value: number, suffix: string) => `+${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
  if (abs >= DAY) return unit(abs / DAY, "d")
  if (abs >= HOUR) return unit(abs / HOUR, "h")
  if (abs >= MINUTE) return unit(abs / MINUTE, "m")
  return unit(Math.round(abs / 1000), "s")
}

/**
 * Ghost extensions (§3.1) for every derived ancestor of the dragged node: walk
 * the parent chain, and for each `derived` (auto-bounded) parent whose live
 * window now reaches past its gesture-start baseline, emit the delta rect(s) to
 * render translucently. Only auto parents grow this way; fixed parents never
 * produce a ghost.
 */
function derivedAncestorGhosts(
  draggingId: string,
  relationships: Record<string, TimelineRelationship>,
  layoutById: Map<string, LayoutEvent>,
  meta: Record<string, NodeRenderMeta>,
  baseline: Record<string, GhostRect>,
): Array<{ id: string; lane: number; rects: GhostRect[] }> {
  const out: Array<{ id: string; lane: number; rects: GhostRect[] }> = []
  const seen = new Set<string>()
  let cursor = relationships[draggingId]?.parentId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const layoutEvent = layoutById.get(cursor)
    if (layoutEvent && meta[cursor]?.provenance === "derived") {
      const rects = ghostExtensions({ start: layoutEvent.startTime, end: layoutEvent.endTime }, baseline[cursor])
      if (rects.length > 0) out.push({ id: cursor, lane: layoutEvent.lane, rects })
    }
    cursor = relationships[cursor]?.parentId
  }
  return out
}

type TimelineStoreHook = ReturnType<typeof createTimelineStore>

const TimelineContext = createContext<TimelineStoreHook | null>(null)

function useTimelineStore() {
  const ctx = useContext(TimelineContext)
  if (!ctx) throw new Error("Timeline parts must be used within <Timeline.Root>")
  return ctx
}

interface RootProps {
  /** Flat legacy events, imported into a rigid absolute tree (§8). Ignored when `tree` is given. */
  events?: TimelineEvent[]
  viewStart: number
  viewEnd: number
  /** Initial parent → children links, keyed by child id. Seeded once at mount, same as `events`. */
  relationships?: Record<string, TimelineRelationship>
  /** Seed directly from a schedule tree (§1) — the path for vector/recurring demos. Takes precedence over `events`. */
  tree?: AbsoluteSchedule
  children: React.ReactNode
  className?: string
}

/** Owns the per-instance zustand store — created once via a ref, not a module-level singleton, so two `<Timeline.Root>`s on one page don't share state. */
function Root({ events, viewStart, viewEnd, relationships, tree, children, className }: RootProps) {
  const storeRef = useRef<TimelineStoreHook | null>(null)
  if (!storeRef.current) storeRef.current = createTimelineStore({ events, viewStart, viewEnd, relationships, tree })

  return (
    <TimelineContext.Provider value={storeRef.current}>
      <div data-slot="timeline" className={cn("space-y-2", className)}>
        {children}
      </div>
    </TimelineContext.Provider>
  )
}

interface CanvasProps {
  /** Fixed pixel width. Omit to fill the container's available width (measured via ResizeObserver). */
  width?: number
  height?: number
  className?: string
  /**
   * Fired when a conflicting-but-compressible bar's "fit" affordance is
   * clicked (§2.1). The actual Fit/compress UI is a separate story; this is
   * the emit point — a consumer wires it to `compress()` when that lands.
   */
  onFitRequest?: (id: string) => void
}

function Canvas({ width: widthProp, height, className, onFitRequest }: CanvasProps) {
  const store = useTimelineStore()
  const events = store(selectEvents)
  const relationships = store(selectRelationships)
  const meta = store(selectMeta)
  const tree = store((s) => s.tree)
  const overrides = store((s) => s.overrides)
  const blockers = store((s) => s.blockers)
  const selection = store((s) => s.selection)
  const viewStart = store((s) => s.viewStart)
  const viewEnd = store((s) => s.viewEnd)
  const moveEventCascade = store((s) => s.moveEventCascade)
  const resizeEvent = store((s) => s.resizeEvent)
  const moveOccurrence = store((s) => s.moveOccurrence)
  const fit = store((s) => s.fit)
  const setSelection = store((s) => s.setSelection)
  const toggleSelection = store((s) => s.toggleSelection)
  const clearSelection = store((s) => s.clearSelection)
  const deleteSelected = store((s) => s.deleteSelected)
  const setViewRange = store((s) => s.setViewRange)
  const setParent = store((s) => s.setParent)
  const undo = store((s) => s.undo)
  const redo = store((s) => s.redo)

  const [pendingMove, setPendingMove] = useState<PendingOccurrenceMove | null>(null)
  // Undo/redo fire only while the canvas has the pointer or focus (§7), so the
  // timeline's history doesn't hijack Cmd+Z for the rest of the page.
  const [active, setActive] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  // Deliberately document-scoped, not `target: containerRef`: undo must fire
  // while the canvas has the pointer (`active`) even when DOM keyboard focus
  // sits in a sibling panel (e.g. the Fit-target input in Timeline.Inspector),
  // which a container-scoped listener would miss entirely. Multiple Timeline
  // instances on one page (e.g. the showcase) therefore all register on the
  // same document target — an intentional, mutually-exclusive-by-`enabled`
  // pattern the library's duplicate-hotkey warning doesn't know is safe.
  useHotkey("Mod+Z", () => undo(), { enabled: active, conflictBehavior: "allow" })
  useHotkey("Mod+Shift+Z", () => redo(), { enabled: active, conflictBehavior: "allow" })
  const measuredWidth = useElementWidth(containerRef)
  const width = widthProp ?? measuredWidth

  const eventList = useMemo(() => Object.values(events), [events])
  const layout = useMemo(() => calculateEventLayout(eventList), [eventList])
  const layoutById = useMemo(() => new Map(layout.map((layoutEvent) => [layoutEvent.event.id, layoutEvent])), [layout])
  // Reserved strip for the date-tick row so labels never sit on top of
  // lane-0 events — without it, a tick at y=12 and a lane-0 event label at
  // y≈31 (19px apart, both ~9px tall) read as visually overlapping whenever
  // an event's x position happens to land near a tick (common, since events
  // often start/end on round day boundaries).
  const TICK_HEADER_HEIGHT = 20
  const laneAreaHeight = height ?? calculateTimelineHeight(layout)
  const timelineHeight = laneAreaHeight + TICK_HEADER_HEIGHT
  const scale = useMemo(() => createTimeScale(viewStart, viewEnd, width || 1), [viewStart, viewEnd, width])
  // Tick count scales with available width instead of a fixed count — a
  // fixed count means labels overlap as soon as the view is zoomed out far
  // enough that 8 date labels no longer fit in the same pixel width.
  const ticks = useMemo(() => scale.ticks(Math.max(2, Math.floor(width / 90))), [scale, width])
  // Ambient snap grid for the current zoom (§1.2) — one step finer than the
  // date-tick labels above, so a drag lands on grid without the user aiming.
  const ambientMs = ambientGridMs(viewEnd - viewStart)

  useTimelineScroll({ containerRef, viewStart, viewEnd, onViewChange: setViewRange })
  useTimelineKeyboard({
    selection,
    allEventIds: eventList.map((e) => e.id),
    onDeleteSelected: deleteSelected,
    onSelectAll: setSelection,
    onClearSelection: clearSelection,
  })

  // Baseline windows captured at gesture start, so a derived parent's ghost
  // extension (§3.1) can be measured against where it sat before the drag.
  // A ref, not state: it's read imperatively at render, never drives one.
  const ghostBaselineRef = useRef<Record<string, GhostRect>>({})

  // The recurring series' in-view echo bars (§5.2) — recomputed only when the
  // tree, overrides, or view moves, never per drag frame.
  const shadows = useMemo(
    () => computeSeriesShadows(tree, overrides, WALL_CLOCK_PROVIDER, viewStart, viewEnd),
    [tree, overrides, viewStart, viewEnd],
  )
  const recurringId = shadows?.nodeId ?? null

  const { handleEventMouseDown, linkTargetId, draggingId, overrideActive } = useTimelineEventDrag({
    scale,
    ambientMs,
    nodeQuantumMs: (id) => meta[id]?.quantumMs,
    isRecurring: (id) => id === recurringId,
    onDragStart: (id) => {
      if (!selection.includes(id)) setSelection([id])
      const baseline: Record<string, GhostRect> = {}
      for (const layoutEvent of layout) baseline[layoutEvent.event.id] = { start: layoutEvent.startTime, end: layoutEvent.endTime }
      ghostBaselineRef.current = baseline
    },
    onMove: moveEventCascade,
    onResize: resizeEvent,
    onLink: setParent,
    onOverrideMove: (id, startMs) => moveOccurrence(id, 0, startMs),
  })

  // Re-center the view on an occurrence, preserving span (§5.2 click-to-recenter).
  const recenterOn = (start: number) => {
    const span = viewEnd - viewStart
    setViewRange(start - span / 2, start + span / 2)
  }

  const { handleOccurrenceMouseDown, overridingKey } = useTimelineOccurrenceDrag({
    scale,
    ambientMs,
    onOverrideMove: (nodeId, index, startMs) => moveOccurrence(nodeId, index, startMs),
    onPlainDrop: (pending) => setPendingMove(pending),
    onClick: (ref: OccurrenceRef) => {
      if (recurringId) setSelection([recurringId])
      recenterOn(ref.start)
    },
  })

  const ghosts = draggingId ? derivedAncestorGhosts(draggingId, relationships, layoutById, meta, ghostBaselineRef.current) : []

  const laneCenterY = (lane: number) => TICK_HEADER_HEIGHT + getLaneYPosition(lane) + LANE_HEIGHT / 2

  // Focused-bar detach (§4.4): once occurrence 0 has an override, the base bar
  // follows it (full opacity) instead of sitting on the series pattern. The
  // occurrence-0 override is now folded into the flat event by the store, so the
  // bar's position comes from `layout` directly — no manual pixel shift here.
  const recurringLayout = recurringId ? layoutById.get(recurringId) : undefined
  const recurringLane = recurringLayout?.lane ?? 0
  const recurringColor = recurringId ? events[recurringId]?.color ?? "var(--color-primary)" : "var(--color-primary)"
  const focusedOverrideStart = shadows?.focusedOverrideStart ?? null

  // The conflict badge's "fits if compressed" affordance (§2.1): repair by
  // compress()-ing the conflicting node's PARENT to its own current (still
  // conflicting) span — the parent window doesn't change, but its children
  // redistribute to fit inside it. `onFitRequest` still fires afterward for a
  // consumer that wants its own notification on top of the default repair.
  const handleFitRequest = (id: string) => {
    const parentId = relationships[id]?.parentId
    const parentLayout = parentId ? layoutById.get(parentId) : undefined
    if (parentLayout) fit(parentId!, parentLayout.endTime - parentLayout.startTime)
    onFitRequest?.(id)
  }

  const resolvePendingMove = (scope: "occurrence" | "series") => {
    if (!pendingMove) return
    if (scope === "occurrence") moveOccurrence(pendingMove.nodeId, pendingMove.occurrenceIndex, pendingMove.targetStart)
    else moveEventCascade(pendingMove.nodeId, pendingMove.targetStart - pendingMove.start)
    setPendingMove(null)
  }

  return (
    <div
      ref={containerRef}
      data-slot="timeline-canvas"
      tabIndex={0}
      className={cn("relative overflow-hidden rounded-md border border-border bg-card outline-none select-none", widthProp == null && "w-full", className)}
      style={{ width: widthProp, height: timelineHeight }}
      onMouseDown={() => clearSelection()}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <svg width={width} height={timelineHeight} className="absolute inset-0">
        {ticks.map((tick, i) => {
          const x = scale(tick)
          return (
            <g key={i}>
              <line x1={x} y1={TICK_HEADER_HEIGHT} x2={x} y2={timelineHeight} className="stroke-border" strokeWidth={1} />
              <text x={x + 4} y={12} className="fill-muted-foreground font-mono text-[9px]">
                {tick.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            </g>
          )
        })}

        {/* Relationship arrows — dependency overlay, doesn't affect scheduling */}
        {Object.entries(relationships).map(([childId, rel]) => {
          if (!rel.parentId) return null
          const parentLayout = layout.find((l) => l.event.id === rel.parentId)
          const childLayout = layout.find((l) => l.event.id === childId)
          if (!parentLayout || !childLayout) return null
          const x1 = scale(new Date(parentLayout.endTime))
          const y1 = laneCenterY(parentLayout.lane)
          const x2 = scale(new Date(childLayout.startTime))
          const y2 = laneCenterY(childLayout.lane)
          const midX = (x1 + x2) / 2
          return (
            <path
              key={childId}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              markerEnd="url(#timeline-arrow)"
            />
          )
        })}

        <defs>
          <marker id="timeline-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {/* Ghost extensions — a derived parent's live growth past its pre-drag
            edge, shown translucent while a child drag is pushing it (§3.1). */}
        {ghosts.map((ghost) =>
          ghost.rects.map((rect, i) => {
            const gx = scale(new Date(rect.start))
            const gw = Math.max(scale(new Date(rect.end)) - gx, 1)
            return (
              <rect
                key={`ghost-${ghost.id}-${i}`}
                x={gx}
                y={TICK_HEADER_HEIGHT + getLaneYPosition(ghost.lane)}
                width={gw}
                height={LANE_HEIGHT}
                rx={4}
                className="pointer-events-none fill-primary/15 stroke-primary/50"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )
          }),
        )}

        {/* Shadow echo bars — the recurring series' other occurrences (§5.2).
            Under the focused/authored bars so real events stay legible. */}
        {shadows?.shadows.map((shadow) => (
          <ShadowBar
            key={`shadow-${shadow.occurrenceIndex}`}
            shadow={shadow}
            scale={scale}
            y={TICK_HEADER_HEIGHT + getLaneYPosition(recurringLane)}
            color={recurringColor}
            isOverriding={overridingKey === `${recurringId}:${shadow.occurrenceIndex}`}
            onMouseDown={(e) => recurringId && handleOccurrenceMouseDown(e, { nodeId: recurringId, occurrenceIndex: shadow.occurrenceIndex, start: shadow.start })}
          />
        ))}

        {layout.map((layoutEvent) => {
          const id = layoutEvent.event.id
          const isRecurringFocused = id === recurringId
          return (
            <TimelineEventVisual
              key={id}
              layoutEvent={layoutEvent}
              scale={scale}
              yOffset={TICK_HEADER_HEIGHT}
              isSelected={selection.includes(id)}
              isLinkTarget={linkTargetId === id}
              isBlocker={blockers.includes(id)}
              meta={meta[id]}
              detached={isRecurringFocused && (focusedOverrideStart != null || overrideActive)}
              onMouseDown={handleEventMouseDown}
              onFitRequest={handleFitRequest}
              onClick={(e) => {
                e.stopPropagation()
                if (e.shiftKey) toggleSelection(id)
                else setSelection([id])
              }}
            />
          )
        })}

        {/* Overflow chip on the focused bar when shadows exceed the cap (§5.2). */}
        {shadows && shadows.overflowCount > 0 && recurringLayout && (
          <OverflowChip
            x={scale(new Date(recurringLayout.startTime))}
            y={TICK_HEADER_HEIGHT + getLaneYPosition(recurringLane)}
            count={shadows.overflowCount}
            through={shadows.overflowThrough}
          />
        )}
      </svg>

      {/* This-occurrence-vs-series choice on a plain-drag drop (§4.4). */}
      {pendingMove && (
        <OccurrenceChoicePopover
          pending={pendingMove}
          onResolve={resolvePendingMove}
          onDismiss={() => setPendingMove(null)}
        />
      )}
    </div>
  )
}

/** One recurring occurrence rendered as an echo (§5.2): ~20% opacity, no handles, draggable/clickable. Modified → full opacity; cancelled → slashed. */
function ShadowBar({
  shadow,
  scale,
  y,
  color,
  isOverriding,
  onMouseDown,
}: {
  shadow: ShadowInstance
  scale: ReturnType<typeof createTimeScale>
  y: number
  color: string
  isOverriding: boolean
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const x1 = scale(new Date(shadow.start))
  const x2 = scale(new Date(shadow.end ?? shadow.start))
  const barWidth = Math.max(x2 - x1, 2)
  // A modified occurrence is its own fact, not an echo — full opacity even
  // unfocused; an in-flight Cmd-drag detaches to full opacity immediately.
  const solid = shadow.isModified || isOverriding
  return (
    <g data-timeline-occurrence-index={shadow.occurrenceIndex} data-no-pan onMouseDown={onMouseDown} className="cursor-grab">
      <rect
        x={x1}
        y={y}
        width={barWidth}
        height={LANE_HEIGHT}
        rx={4}
        fill={color}
        fillOpacity={solid ? 0.25 : 0.12}
        stroke={color}
        strokeOpacity={solid ? 1 : 0.3}
        strokeDasharray={shadow.cancelled ? "3 3" : undefined}
      />
      {shadow.cancelled && (
        <line x1={x1} y1={y} x2={x1 + barWidth} y2={y + LANE_HEIGHT} className="stroke-destructive" strokeWidth={1.5} strokeOpacity={0.5} />
      )}
    </g>
  )
}

/** "×147 through Aug 1" — the suppressed-occurrence count when shadows exceed the cap (§5.2). */
function OverflowChip({ x, y, count, through }: { x: number; y: number; count: number; through: number | null }) {
  const label = through != null ? `×${count} through ${new Date(through).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : `×${count}`
  const width = label.length * 6 + 12
  return (
    <g transform={`translate(${x}, ${y - 16})`} className="pointer-events-none">
      <rect width={width} height={14} rx={3} className="fill-muted stroke-border" strokeWidth={1} />
      <text x={width / 2} y={10} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">
        {label}
      </text>
    </g>
  )
}

/** The one-time "this occurrence / whole series" choice on a plain-drag drop (§4.4). */
function OccurrenceChoicePopover({
  pending,
  onResolve,
  onDismiss,
}: {
  pending: PendingOccurrenceMove
  onResolve: (scope: "occurrence" | "series") => void
  onDismiss: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onDismiss} />
      <div
        role="dialog"
        aria-label="Move recurring occurrence"
        className="fixed z-50 flex flex-col gap-1 rounded-md border border-border bg-popover p-1.5 text-xs shadow-md"
        style={{ left: pending.clientX, top: pending.clientY }}
      >
        <button type="button" className="rounded-sm px-2 py-1 text-left hover:bg-muted" onClick={() => onResolve("occurrence")}>
          Move this occurrence only
        </button>
        <button type="button" className="rounded-sm px-2 py-1 text-left hover:bg-muted" onClick={() => onResolve("series")}>
          Move the whole series
        </button>
      </div>
    </>
  )
}

interface TimelineEventVisualProps {
  layoutEvent: LayoutEvent
  scale: ReturnType<typeof createTimeScale>
  /** Vertical offset reserving the date-tick header row above lane 0. */
  yOffset: number
  isSelected: boolean
  isLinkTarget: boolean
  /** A rigid / at-floor child a failed Fit couldn't shrink (§4.5) — destructive outline. */
  isBlocker?: boolean
  /** Resolved render facts — bounds status, conflict, provenance (§2–3). Absent while resolve() is degraded. */
  meta?: NodeRenderMeta
  /** Occurrence 0 detached from the series pattern (§4.4) — force full opacity. */
  detached?: boolean
  onMouseDown: (e: React.MouseEvent, layoutEvent: LayoutEvent, mode: DragMode) => void
  onClick: (e: React.MouseEvent) => void
  onFitRequest?: (id: string) => void
}

/**
 * The overflow badge at a conflict's edge (§2.1): the overrun magnitude, and —
 * when the core says a `compress()` would repair it — a clickable "fit"
 * affordance that emits `onFitRequest`. Rendered just outside the conflicting
 * edge so it reads as "this much past the boundary."
 */
function OverflowBadge({
  x,
  y,
  edge,
  overrun,
  compressible,
  onFit,
}: {
  x: number
  y: number
  edge: "start" | "end"
  overrun: number | null
  compressible: boolean
  onFit?: () => void
}) {
  const label = compressible ? `${formatOverrun(overrun)} ⤢ fit` : formatOverrun(overrun)
  const width = label.length * 6 + 10
  const anchorEnd = edge === "end"
  const boxX = anchorEnd ? x + 4 : x - 4 - width
  const cy = y + LANE_HEIGHT / 2
  return (
    <g
      transform={`translate(${boxX}, ${cy - 8})`}
      className={compressible ? "cursor-pointer" : undefined}
      onMouseDown={compressible ? (e) => e.stopPropagation() : undefined}
      onClick={
        compressible
          ? (e) => {
              e.stopPropagation()
              onFit?.()
            }
          : undefined
      }
    >
      <rect width={width} height={16} rx={3} className="fill-destructive/15 stroke-destructive" strokeWidth={1} />
      <text x={width / 2} y={11} textAnchor="middle" className="pointer-events-none fill-destructive font-mono text-[9px]">
        {label}
      </text>
    </g>
  )
}

/** The main-canvas composition of a TimelineEvent — draggable bar (range) or diamond marker (instantaneous), with resize handles for ranges. */
function TimelineEventVisual({ layoutEvent, scale, yOffset, isSelected, isLinkTarget, isBlocker, meta, detached, onMouseDown, onClick, onFitRequest }: TimelineEventVisualProps) {
  const { event, lane } = layoutEvent
  const y = yOffset + getLaneYPosition(lane)
  const color = event.color ?? "var(--color-primary)"
  const conflicting = meta?.boundsStatus === "conflicting"
  const derived = meta?.provenance === "derived" && !detached
  const conflict = meta?.conflict
  // Occurrence 0 cancelled by an override (§5.2) — the base bar reads as struck
  // through, mirroring a cancelled shadow, so cancelling the focused occurrence
  // isn't silently invisible.
  const cancelled = meta?.cancelled ?? false

  if (event.type === "instantaneous") {
    const x = scale(new Date(event.timestamp))
    const cy = y + LANE_HEIGHT / 2
    return (
      <g data-timeline-event-id={event.id} data-no-pan onMouseDown={(e) => onMouseDown(e, layoutEvent, "move")} onClick={onClick} className="cursor-pointer">
        <rect
          x={x - 6}
          y={cy - 6}
          width={12}
          height={12}
          fill={color}
          transform={`rotate(45 ${x} ${cy})`}
          className={cn(
            "transition-all",
            (conflicting || isBlocker) && "stroke-2 stroke-destructive",
            isSelected && "stroke-2 stroke-foreground",
            isLinkTarget && "stroke-2 stroke-destructive",
          )}
        />
        <text x={x + 10} y={cy + 3} className="fill-foreground font-mono text-[9px]">
          {event.title}
        </text>
        {conflicting && conflict && (
          <OverflowBadge x={x} y={y} edge={conflict.edge} overrun={conflict.overrun} compressible={conflict.compressible} onFit={() => onFitRequest?.(event.id)} />
        )}
      </g>
    )
  }

  const x1 = scale(new Date(event.startTime))
  const x2 = scale(new Date(event.endTime))
  const barWidth = Math.max(x2 - x1, 2)

  return (
    <g data-timeline-event-id={event.id} data-no-pan>
      <rect
        x={x1}
        y={y}
        width={barWidth}
        height={LANE_HEIGHT}
        rx={4}
        fill={color}
        fillOpacity={cancelled ? 0.06 : derived ? 0.1 : 0.25}
        strokeDasharray={cancelled ? "3 3" : derived ? "4 3" : undefined}
        className={cn(
          "cursor-grab transition-all",
          derived && "stroke-muted-foreground/50",
          isSelected && "stroke-2 stroke-foreground",
          isLinkTarget && "stroke-2 stroke-destructive",
        )}
        stroke={color}
        onMouseDown={(e) => onMouseDown(e, layoutEvent, "move")}
        onClick={onClick}
      />
      {/* Bounds-status outline, drawn as its own rect so it composes with the
          selection stroke instead of fighting it (§2.1) — fill=provenance,
          outline=bounds status, they never collide on the same channel. */}
      {(conflicting || isBlocker) && (
        <rect
          x={x1}
          y={y}
          width={barWidth}
          height={LANE_HEIGHT}
          rx={4}
          fill="none"
          className="pointer-events-none stroke-destructive"
          strokeWidth={2}
          strokeDasharray={isBlocker && !conflicting ? "4 2" : undefined}
        />
      )}
      {cancelled && (
        <line x1={x1} y1={y + LANE_HEIGHT} x2={x1 + barWidth} y2={y} className="pointer-events-none stroke-muted-foreground" strokeWidth={1} />
      )}
      <text x={x1 + 6} y={y + LANE_HEIGHT / 2 + 3} className="pointer-events-none fill-foreground font-mono text-[9px]">
        {event.title}
      </text>
      <rect x={x1 - 2} y={y} width={4} height={LANE_HEIGHT} className="cursor-ew-resize fill-transparent" onMouseDown={(e) => onMouseDown(e, layoutEvent, "resize-start")} />
      <rect x={x2 - 2} y={y} width={4} height={LANE_HEIGHT} className="cursor-ew-resize fill-transparent" onMouseDown={(e) => onMouseDown(e, layoutEvent, "resize-end")} />
      {conflicting && conflict && (
        <OverflowBadge
          x={conflict.edge === "end" ? x2 : x1}
          y={y}
          edge={conflict.edge}
          overrun={conflict.overrun}
          compressible={conflict.compressible}
          onFit={() => onFitRequest?.(event.id)}
        />
      )}
    </g>
  )
}

interface MinimapProps {
  /** Fixed pixel width. Omit to fill the container's available width (measured via ResizeObserver). */
  width?: number
  height?: number
  className?: string
}

function Minimap({ width: widthProp, height = 48, className }: MinimapProps) {
  const store = useTimelineStore()
  const events = store(selectEvents)
  const viewStart = store((s) => s.viewStart)
  const viewEnd = store((s) => s.viewEnd)
  const setViewRange = store((s) => s.setViewRange)

  const containerRef = useRef<HTMLDivElement>(null)
  const measuredWidth = useElementWidth(containerRef)
  const width = widthProp ?? measuredWidth

  const eventList = useMemo(() => Object.values(events), [events])
  const layout = useMemo(() => calculateEventLayout(eventList), [eventList])

  const [overallStart, overallEnd] = useMemo(() => {
    if (eventList.length === 0) return [viewStart, viewEnd]
    const times = eventList.flatMap(eventTimeRange)
    const span = Math.max(...times) - Math.min(...times)
    const padding = Math.max(span * 0.1, 60_000)
    return [Math.min(...times) - padding, Math.max(...times) + padding]
  }, [eventList, viewStart, viewEnd])

  const scale = useMemo(() => createTimeScale(overallStart, overallEnd, width || 1), [overallStart, overallEnd, width])

  const { startDrag } = useMinimapDrag({ overallStart, overallEnd, width, viewStart, viewEnd, onViewChange: setViewRange })

  const viewX1 = scale(new Date(viewStart))
  const viewX2 = scale(new Date(viewEnd))

  return (
    <div ref={containerRef} className={cn(widthProp == null && "w-full")}>
      <svg
        data-slot="timeline-minimap"
        width={width}
        height={height}
        className={cn("select-none rounded-md border border-border bg-card", className)}
        onMouseDown={(e) => {
          // Click outside the viewport box jumps the view to be centered there.
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const clickX = e.clientX - rect.left
          if (clickX >= viewX1 && clickX <= viewX2) return
          const clickedTime = scale.invert(clickX).getTime()
          const range = viewEnd - viewStart
          setViewRange(clickedTime - range / 2, clickedTime + range / 2)
        }}
      >
        {layout.map((layoutEvent) => {
          const [start, end] = eventTimeRange(layoutEvent.event)
          const x1 = scale(new Date(start))
          const x2 = Math.max(scale(new Date(end)), x1 + 2)
          return <rect key={layoutEvent.event.id} x={x1} y={4} width={x2 - x1} height={height - 8} rx={1} fill={layoutEvent.event.color ?? "var(--color-primary)"} fillOpacity={0.5} />
        })}

        <rect
          x={viewX1}
          y={0.75}
          width={Math.max(viewX2 - viewX1, 4)}
          height={height - 1.5}
          className="cursor-grab fill-primary/10 stroke-primary"
          strokeWidth={1.5}
          onMouseDown={(e) => {
            e.stopPropagation()
            startDrag("pan", e.clientX)
          }}
        />
        <rect
          x={viewX1 - 3}
          y={0}
          width={6}
          height={height}
          className="cursor-ew-resize fill-transparent"
          onMouseDown={(e) => {
            e.stopPropagation()
            startDrag("resize-start", e.clientX)
          }}
        />
        <rect
          x={viewX2 - 3}
          y={0}
          width={6}
          height={height}
          className="cursor-ew-resize fill-transparent"
          onMouseDown={(e) => {
            e.stopPropagation()
            startDrag("resize-end", e.clientX)
          }}
        />
      </svg>
    </div>
  )
}

/** Event-type counts — a value that changes as events are added/removed/change type, not decoration. */
function Legend({ className }: { className?: string }) {
  const store = useTimelineStore()
  const events = store(selectEvents)
  const counts = { instantaneous: 0, range: 0 }
  for (const event of Object.values(events)) counts[event.type]++

  return (
    <div data-slot="timeline-legend" className={cn("flex items-center gap-2", className)}>
      <Badge variant="outline" className="gap-1.5">
        <span className="size-2 rotate-45 bg-primary" />
        Instantaneous {counts.instantaneous}
      </Badge>
      <Badge variant="outline" className="gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-primary" />
        Range {counts.range}
      </Badge>
    </div>
  )
}

// ─── Inspector (§4) + Fit/Trim (§4.5) ───────────────────────────────────────

interface NodeContext {
  node: Schedule
  siblings: Schedule[]
  parentBoundsMode: BoundsMode | null
}

/** Locate a node plus its siblings and parent bounds mode — the inspector's context (§4.1, §4.3). */
function findNodeContext(root: AbsoluteSchedule, id: string): NodeContext | null {
  if (root.id === id) return { node: root, siblings: [], parentBoundsMode: null }
  function walk(parent: Schedule): NodeContext | null {
    for (const child of parent.children) {
      if (child.id === id) return { node: child, siblings: parent.children, parentBoundsMode: parent.boundsMode }
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(root)
}

/** A span in ms rendered compactly ("2d 12h", "45m") for the Fit report and min-window readout. */
function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0"
  const days = Math.floor(ms / DAY)
  const hours = Math.round((ms - days * DAY) / HOUR)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  return parts.length ? parts.join(" ") : `${Math.round(ms / MINUTE)}m`
}

/**
 * The property inspector for the single selected node (§4). Selection-driven and
 * store-wired: it resolves the node's context and derived window, then routes the
 * presentational `TimelineInspector`'s intents to the store's undoable actions.
 */
function Inspector({ className }: { className?: string }) {
  const store = useTimelineStore()
  const tree = store((s) => s.tree)
  const selection = store((s) => s.selection)
  const applyPatch = store((s) => s.applyPatch)
  const setBoundsMode = store((s) => s.setBoundsMode)
  const setRecurrence = store((s) => s.setRecurrence)

  if (selection.length !== 1) {
    return (
      <div data-slot="timeline-inspector-empty" className={cn("text-xs text-muted-foreground", className)}>
        {selection.length === 0 ? "Select an event to edit its timing." : `${selection.length} selected — select one to edit.`}
      </div>
    )
  }

  const ctx = findNodeContext(tree, selection[0])
  if (!ctx) return null
  const { node, siblings, parentBoundsMode } = ctx
  const derivedWindow = node.boundsMode === "auto" ? resolvedWindowOf(tree, node.id) ?? undefined : undefined

  return (
    <div data-slot="timeline-inspector-panel" className={cn("flex flex-col gap-4", className)}>
      <TimelineInspector.Root
        node={node}
        siblings={siblings}
        parentBoundsMode={parentBoundsMode}
        derivedWindow={derivedWindow}
        formatValue={(ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        onChange={(patch) => applyPatch(node.id, patch)}
        onBoundsToggle={(toggle) => setBoundsMode(node.id, toggle)}
        onRecurrenceChange={(rule) => setRecurrence(node.id, rule)}
      >
        <TimelineInspector.Anchor />
        <TimelineInspector.Timing />
        <TimelineInspector.Flexibility />
        <TimelineInspector.Bounds />
        <TimelineInspector.Repeats />
      </TimelineInspector.Root>
      {node.children.length > 0 && <FitTrimPanel key={node.id} nodeId={node.id} />}
    </div>
  )
}

type FitFeedback =
  | { kind: "success"; report: NodeAdjustment[] }
  | { kind: "failure"; deficit: number; blockers: string[] }
  | null

const TRIM_GRIDS: { label: string; unit: number }[] = [
  { label: "Day", unit: DAY },
  { label: "Week", unit: 7 * DAY },
]
const TRIM_POLICIES: TrimPolicy[] = ["nearest", "expand", "contract"]

/**
 * Fit-to and Trim-to actions for a parent node (§4.5). Fit shows the read-only
 * feasibility floor (minimalWindow) before the attempt, reports each child's
 * adjustment on success, and surfaces the deficit + blockers on failure (the
 * canvas outlines the blocker bars via the store). Trim snaps to a grid under a
 * policy; the combined preset runs compress-then-trim (core §8.1).
 */
function FitTrimPanel({ nodeId }: { nodeId: string }) {
  const store = useTimelineStore()
  const tree = store((s) => s.tree)
  const fit = store((s) => s.fit)
  const trimNode = store((s) => s.trimNode)
  const compressThenTrim = store((s) => s.compressThenTrim)
  const minimalWindowOf = store((s) => s.minimalWindowOf)

  const minWindow = useMemo(() => minimalWindowOf(nodeId), [minimalWindowOf, nodeId, tree])
  const [targetHours, setTargetHours] = useState(() => Math.max(1, Math.round(minWindow / HOUR)))
  const [gridUnit, setGridUnit] = useState(DAY)
  const [policy, setPolicy] = useState<TrimPolicy>("nearest")
  const [feedback, setFeedback] = useState<FitFeedback>(null)

  const targetMs = targetHours * HOUR
  const grid: Quantum = { unit: gridUnit, mode: "nearest", origin: 0 }

  function absorb(result: ReturnType<typeof fit>) {
    setFeedback(result.ok ? { kind: "success", report: result.report } : { kind: "failure", deficit: result.deficit, blockers: result.blockers })
  }

  return (
    <div data-slot="timeline-fit-trim" className="flex flex-col gap-3 border-t border-border pt-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Fit to</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            step={1}
            aria-label="Fit target hours"
            value={targetHours}
            onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setTargetHours(Math.max(0, e.target.valueAsNumber))}
            className="h-7 w-20 rounded-md border border-input bg-input/20 px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <span className="text-[11px] text-muted-foreground">hours</span>
          <Button size="sm" variant="outline" className="h-7" disabled={targetMs <= 0} onClick={() => absorb(fit(nodeId, targetMs))}>
            Fit
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Min window <span className="tabular-nums text-foreground">{formatDurationMs(minWindow)}</span> — the tightest this parent packs.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Trim to</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <NativeSelect size="sm" aria-label="Trim grid" value={String(gridUnit)} onChange={(e) => setGridUnit(Number(e.target.value))}>
            {TRIM_GRIDS.map((g) => (
              <NativeSelectOption key={g.label} value={String(g.unit)}>
                {g.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect size="sm" aria-label="Trim policy" value={policy} onChange={(e) => setPolicy(e.target.value as TrimPolicy)}>
            {TRIM_POLICIES.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" className="h-7" onClick={() => { trimNode(nodeId, grid, policy); setFeedback(null) }}>
            Trim
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={targetMs <= 0} onClick={() => absorb(compressThenTrim(nodeId, targetMs, grid, policy))}>
            Compress + trim
          </Button>
        </div>
      </div>

      {feedback?.kind === "success" && (
        <div role="status" className="flex flex-col gap-0.5 rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px]">
          <span className="font-medium text-primary">Fit applied</span>
          {feedback.report.length === 0 ? (
            <span className="text-muted-foreground">No adjustment needed — already within target.</span>
          ) : (
            feedback.report.map((adj, i) => (
              <span key={i} className="tabular-nums text-muted-foreground">
                {adj.nodeId} {adj.target}: {formatDurationMs(adj.from)} → {formatDurationMs(adj.to)}
              </span>
            ))
          )}
        </div>
      )}
      {feedback?.kind === "failure" && (
        <div role="alert" className="flex flex-col gap-0.5 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-[11px]">
          <span className="font-medium text-destructive">Can't fit — deficit {formatDurationMs(feedback.deficit)}</span>
          <span className="text-muted-foreground">Blocked by {feedback.blockers.join(", ")} (outlined on the canvas).</span>
        </div>
      )}
    </div>
  )
}

export const Timeline = { Root, Canvas, Minimap, Legend, Inspector }
export { useTimelineStore }
