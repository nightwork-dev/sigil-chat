"use client";

// EraBand — a horizontal band of ordered segments. Each segment is sized by a
// measured span (proportional, solid edges) or, when unmeasured, an equal
// share of the band (sequence, the hatch/soft-edge "order-only" treatment) —
// ruling 2: sequence is the backbone, proportion is a privilege, and the two
// must read as visually distinct so fake precision never displays. Soft
// boundaries feather to a gradient (ruling 3). A thin cursor marks a position
// on the rendered axis.
//
// The band carries NO domain semantics: it knows nothing about what the
// segments represent in the caller's world — labels, spans, and tones are
// caller-supplied display shapes (with no tone, segments alternate two
// neutral steps). Positions/spans are caller-computed; this component only
// renders them honestly.
//
// Flat (not compound Root/Parts): the band is one surface of absolutely-laid
// segments sharing one axis, not independently composable parts — the RULE 1
// exception for single-shape surfaces (compare DocumentMinimap, Meter).

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@workspace/ui/lib/utils";
import {
  clamp01,
  cursorToPercent,
  describeEra,
  resolveEraLayout,
  scrollLeftForCursor,
  type EraBandEra,
} from "@workspace/ui/lib/era-axis";
import { hatch, softEdgeMask } from "@workspace/ui/lib/patterns";

export type { EraBandEra } from "@workspace/ui/lib/era-axis";

export interface EraBandProps {
  /** Ordered segments (array order IS the sequence backbone). */
  eras: EraBandEra[];
  /** Cursor position on the rendered 0..1 axis; null hides the marker. */
  cursor?: number | null;
  /** Caller-formatted cursor text for assistive output. Defaults to a percentage. */
  cursorLabel?: string;
  /** Called with an era's id when it is activated (click/keyboard). */
  onSelectEra?: (id: string) => void;
  height?: "sm" | "md";
  className?: string;
}

// Below this many pixels of band width per segment the band stops shrinking
// and scrolls instead — a 12-segment band at 375px scrolls rather than
// collapsing to unreadable slivers. The min-width lives on the inner track so
// absolute % positioning (which the cursor alignment depends on) keeps
// meaning: segments fill the full scrollable width by fraction.
const MIN_SEGMENT_PX = 64;
const FADE_PX = 10;

function EraBand({
  eras,
  cursor,
  cursorLabel,
  onSelectEra,
  height = "md",
  className,
}: EraBandProps) {
  const layout = resolveEraLayout(eras);
  const interactive = typeof onSelectEra === "function";
  const cursorPosition = cursor == null ? null : clamp01(cursor) * 100;
  const cursorAnnouncement =
    cursor == null
      ? null
      : (cursorLabel ??
        `Cursor at ${cursorToPercent(cursor)} percent of the band.`);
  const layoutByPos = layout.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canLeft: false, canRight: false });

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 1;
    setEdges({
      canLeft: overflow && el.scrollLeft > 1,
      canRight: overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  // Edge-fade mask replicated (NOT extracted) from pill-bar — a third caller
  // hasn't appeared, so the shared-local-pattern discipline keeps it copied.
  // The fade is derived from real scroll geometry so it only appears when
  // content is genuinely offscreen on that side.
  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [measure, layoutByPos]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || cursorPosition == null || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = scrollLeftForCursor(cursorPosition / 100, el.scrollLeft, el.clientWidth, el.scrollWidth);
    measure();
  }, [cursorPosition, layoutByPos, measure]);

  const stops: string[] = [
    edges.canLeft ? "transparent" : "#000",
    `#000 ${FADE_PX}px`,
  ];
  if (edges.canRight) {
    stops.push(`#000 calc(100% - ${FADE_PX}px)`, "transparent");
  } else {
    stops.push("#000");
  }
  const maskImage = `linear-gradient(to right, ${stops.join(", ")})`;

  return (
    <div
      className={cn(
        "relative overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      ref={scrollRef}
      onScroll={measure}
      style={{ maskImage, WebkitMaskImage: maskImage }}
      role="presentation"
    >
      <div
        className={cn("relative min-w-full", height === "sm" ? "h-9" : "h-12")}
        style={{ minWidth: `max(100%, ${layout.length * MIN_SEGMENT_PX}px)` }}
      >
        {layout.map((segment, index) => {
          const era = eras[index]!;
          const widthPct = (segment.end - segment.start) * 100;
          const left = segment.start * 100;
          const softMask = softEdgeMask(era.softStart, era.softEnd);
          const isSequence = segment.mode === "sequence";
          return (
            <EraSegment
              key={era.id}
              era={era}
              leftPct={left}
              widthPct={widthPct}
              sequence={isSequence}
              index={index}
              total={layout.length}
              interactive={interactive}
              onSelect={onSelectEra}
              softMask={softMask}
            />
          );
        })}

        {cursorPosition != null && (
          // Thin marker line + top dot. The percentage is announced (sr-only)
          // rather than rendered as a visible pill so the marker never
          // overflows the band edges.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-20"
            style={{ left: `${cursorPosition}%` }}
          >
            <span className="absolute inset-y-0 -ml-px w-px bg-primary" />
            <span className="absolute -top-0.5 left-0 size-1.5 -translate-x-1/2 rounded-full bg-primary" />
          </div>
        )}
      </div>

      {/* Single composed description: the cursor position. Era labels are
          announced by each focusable segment; this sr-only note layers the
          cursor on top so a screen reader hears both the band and the marker. */}
      <p className="sr-only">{cursorAnnouncement ?? "No cursor."}</p>
    </div>
  );
}

interface EraSegmentProps {
  era: EraBandEra;
  leftPct: number;
  widthPct: number;
  sequence: boolean;
  index: number;
  total: number;
  interactive: boolean;
  onSelect?: (id: string) => void;
  softMask?: string;
}

function EraSegment({
  era,
  leftPct,
  widthPct,
  sequence,
  index,
  total,
  interactive,
  onSelect,
  softMask,
}: EraSegmentProps) {
  // No caller tone → alternate two neutral surface steps so adjacent segments
  // stay distinguishable without the band inventing a color. With a tone, the
  // caller's className wins and supplies the signal color.
  const neutralStep = index % 2 === 0 ? "bg-muted" : "bg-muted/50";
  const label = describeEra(era);
  const widthKey = Math.round(widthPct);

  const style: React.CSSProperties = {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    ...(softMask ? { maskImage: softMask, WebkitMaskImage: softMask } : {}),
  };

  const inner = (
    <>
      {/* Fill: caller tone or neutral step. */}
      <span
        aria-hidden
        className={cn("absolute inset-0", era.tone ?? neutralStep)}
      />
      {/* Sequence (order-only) hatch overlay — the ruling-1/ruling-2 "we know
          the order, not the duration" treatment, visually distinct from a
          proportional solid fill. currentColor keeps it token-driven. */}
      {sequence ? (
        <span
          aria-hidden
          className="absolute inset-0 text-foreground"
          style={{ backgroundImage: hatch() }}
        />
      ) : null}
      <span className="relative flex h-full items-center justify-center px-1">
        <span
          className={cn(
            "truncate text-center font-mono text-[0.625rem] leading-tight",
            sequence ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {era.label}
        </span>
      </span>
      {/* Hard seam between proportional neighbors reads as a clean divider. */}
      {index < total - 1 ? (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-px bg-background/40"
        />
      ) : null}
    </>
  );

  const className = cn(
    "absolute inset-y-0 overflow-hidden",
    interactive
      ? "cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60"
      : "",
  );

  if (interactive && onSelect) {
    return (
      <button
        type="button"
        data-slot="era-segment"
        data-mode={sequence ? "sequence" : "proportional"}
        aria-label={label}
        title={label}
        onClick={() => onSelect(era.id)}
        className={className}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      data-slot="era-segment"
      data-mode={sequence ? "sequence" : "proportional"}
      role="group"
      tabIndex={0}
      aria-label={label}
      className={className}
      style={style}
      // widthKey is referenced to keep the linter from flagging an unused
      // derived value; it also documents that segment width is fractional.
      data-width={widthKey}
    >
      {inner}
    </div>
  );
}

export { EraBand };
