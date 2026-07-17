"use client";

// TimeScrubber — a cursor control that snaps to defined stops and never
// fabricates a position between them. Drag the track and the handle snaps to
// the nearest stop; arrow keys step stop-by-stop; Home/End jump to the ends.
// There is NO input path that lands between two stops (ruling 1: between-stops
// is not a value) — every resolution goes through the snap/step helpers in
// lib/scrubber-stops. Indeterminate spans render hatched on the track (ruling
// 1, first-class unplaceable) and are described in the accessible description.
//
// The scrubber carries NO domain vocabulary: `stops`/`zones`/`value` are
// display shapes with caller-computed positions. It does not know what a
// "moment" or "present" is — `presentLabel` + `onReturnToPresent` are just an
// optional affordance the caller wires when it has a latest position to return to.
//
// Flat (not compound Root/Parts): one track surface with one affordance, not
// independently composed parts — the RULE 1 exception for single-shape
// surfaces (compare ValueScrubber, DocumentMinimap).

import {
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@workspace/ui/lib/utils";
import {
  clamp01,
  describeZones,
  firstStopId,
  lastStopId,
  nextStopId,
  normalizeStopExtent,
  pointerToPosition,
  prevStopId,
  resolveStopIndex,
  snapToNearestStop,
  sortStops,
  type ScrubberStop,
  type ScrubberZone,
} from "@workspace/ui/lib/scrubber-stops";
import { hatch, softEdgeMask } from "@workspace/ui/lib/patterns";

export type {
  ScrubberStop,
  ScrubberZone,
} from "@workspace/ui/lib/scrubber-stops";

export interface TimeScrubberProps {
  /** Defined stops; positions are caller-computed 0..1. */
  stops: ScrubberStop[];
  /** Current stop id, or null for no selection. */
  value: string | null;
  /** Fired during drag / arrow-key movement (live, not final). */
  onChange: (id: string) => void;
  /** Fired when a drag ends or Enter/Space confirms a keyboard move. */
  onCommit: (id: string) => void;
  /** Indeterminate spans rendered hatched on the track. */
  zones?: ScrubberZone[];
  /** When both `presentLabel` + `onReturnToPresent` are provided, a "return"
   *  affordance renders. The caller controls visibility by passing/omitting. */
  presentLabel?: string;
  onReturnToPresent?: () => void;
  /** Accessible label for the slider control. */
  "aria-label"?: string;
  className?: string;
}

function TimeScrubber({
  stops,
  value,
  onChange,
  onCommit,
  zones = [],
  presentLabel,
  onReturnToPresent,
  "aria-label": ariaLabel = "Scrubber",
  className,
}: TimeScrubberProps) {
  const sorted = sortStops(stops);
  const currentIndex = resolveStopIndex(sorted, value);
  const currentStop = currentIndex >= 0 ? sorted[currentIndex]! : null;
  const currentExtent = normalizeStopExtent(currentStop?.extent);
  const zoneDescription = describeZones(zones);
  const zoneDescriptionId = useId();

  const trackRef = useRef<HTMLDivElement>(null);
  // Ephemeral drag-session state in a ref — changes every pointermove, never
  // needs to trigger a render on its own (each onChange re-renders via the
  // caller's controlled prop).
  const draggingRef = useRef<{ pointerId: number; lastStopId: string } | null>(
    null,
  );

  const snapPointerToStop = (clientX: number): string | null => {
    const track = trackRef.current;
    if (!track || sorted.length === 0) return null;
    const rect = track.getBoundingClientRect();
    const position = pointerToPosition(clientX, rect.left, rect.width);
    return snapToNearestStop(position, sorted)?.id ?? null;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (sorted.length === 0) return;
    const id = snapPointerToStop(e.clientX);
    if (!id) return;
    // Selecting the same stop still announces intent; the caller may debounce.
    onChange(id);
    draggingRef.current = { pointerId: e.pointerId, lastStopId: id };
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Already released or detached — drag still tracks while over the track.
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const id = snapPointerToStop(e.clientX);
    if (id) {
      drag.lastStopId = id;
      onChange(id);
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const committedId = drag.lastStopId;
    draggingRef.current = null;
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or detached.
    }
    onCommit(committedId);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextId: string | null = null;
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextId = nextStopId(sorted, value);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextId = prevStopId(sorted, value);
        break;
      case "Home":
        nextId = firstStopId(sorted);
        break;
      case "End":
        nextId = lastStopId(sorted);
        break;
      case "Enter":
      case " ":
        if (value != null) onCommit(value);
        handled = true;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      if (nextId && nextId !== value) onChange(nextId);
    }
  };

  const showReturn =
    Boolean(presentLabel) && typeof onReturnToPresent === "function";
  const handleLeft = currentStop
    ? `${clamp01(currentStop.position) * 100}%`
    : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3">
        {/* The slider IS the track: one focusable control, draggable
            anywhere, keyboard-movable stop-by-stop. touch-action:none is
            mandatory so a mobile drag moves the handle instead of scrolling. */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuenow={currentIndex >= 0 ? currentIndex : undefined}
          aria-valuetext={currentStop ? currentStop.label : "no selection"}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, sorted.length - 1)}
          aria-describedby={zoneDescription ? zoneDescriptionId : undefined}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ touchAction: "none" }}
          className={cn(
            "relative h-6 w-full cursor-pointer select-none rounded-full bg-muted outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring/60",
            draggingRef.current ? "cursor-grabbing" : "cursor-pointer",
          )}
        >
          {/* Indeterminate spans — hatched, first-class unplaceable (ruling 1).
              currentColor keeps the hatch token-driven. */}
          {zones.map((zone, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute inset-y-0 text-foreground"
              style={{
                left: `${clamp01(zone.start) * 100}%`,
                width: `${(clamp01(zone.end) - clamp01(zone.start)) * 100}%`,
                backgroundImage: hatch(),
              }}
            />
          ))}

          {/* A selected stop may represent a real range or authored blur.
              Its extent is visible behind the representative handle rather
              than being collapsed into a false point. */}
          {currentExtent ? (
            <span
              aria-hidden
              className="absolute inset-y-1 rounded-full bg-primary/25"
              style={{
                left: `${currentExtent.start * 100}%`,
                width: `${(currentExtent.end - currentExtent.start) * 100}%`,
                maskImage: softEdgeMask(
                  currentExtent.softStart,
                  currentExtent.softEnd,
                  12,
                ),
                WebkitMaskImage: softEdgeMask(
                  currentExtent.softStart,
                  currentExtent.softEnd,
                  12,
                ),
              }}
            />
          ) : null}

          {/* Tick marks, one per stop. */}
          {sorted.map((stop) => (
            <span
              key={stop.id}
              aria-hidden
              className={cn(
                "absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2",
                stop.id === value ? "bg-primary" : "bg-muted-foreground/50",
              )}
              style={{ left: `${clamp01(stop.position) * 100}%` }}
            />
          ))}

          {/* The handle. Visible only with a current stop; aria-hidden because
              the slider control itself carries the value semantics. */}
          {currentStop && handleLeft ? (
            <span
              aria-hidden
              className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm"
              style={{ left: handleLeft }}
            />
          ) : null}
        </div>

        {showReturn ? (
          <button
            type="button"
            onClick={onReturnToPresent}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {presentLabel}
          </button>
        ) : null}
      </div>

      {/* Current stop's label (shown, per the brief) + zones description. */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            "font-mono",
            currentStop ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {currentStop ? currentStop.label : "No stop selected"}
        </span>
        {zoneDescription ? (
          <span id={zoneDescriptionId} className="sr-only">
            {zoneDescription}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { TimeScrubber };
