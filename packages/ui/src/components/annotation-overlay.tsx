"use client";

// AnnotationOverlay — how an overlay-mode agent part renders against a subject.
//
// Composes existing atoms: a Marker (the inline anchor indicator) as the
// trigger, and a HoverCard (base-ui PreviewCard) for the expand-on-hover body.
// The overlay "floats over the item" — its TRIGGER is a small marker rendered
// at the anchor; hovering reveals the annotation body; clicking could promote
// to a fuller ResponsiveOverlay (deferred — V1 is hover-expand).
//
// The `anchorId` references an AttentionContext.selections item (per
// AGENT-OUTPUT-PROJECTION-SPEC.md §4 / AGENT-SURFACE-COORDINATION-SPEC.md §3).
// It is a DISPLAY HINT, not authority: the HOST decides where to mount this
// overlay (only where the anchor resolves). This component never reads the
// anchor or resolves it — it receives already-resolved `body`/`title` content
// and renders. Resolution + mounting is the host's job (a surface collecting
// overlay-mode parts and placing them beside their attention item).
//
// Carries no domain vocabulary: `title`, `body`, `meta`, `icon` are display
// shapes. It does not know what an "annotation" or a "passage" is — the caller
// adapts its domain into these props one layer up (compare AttentionTile).

import type { ReactNode } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/ui/components/hover-card";
import { Marker, MarkerContent, MarkerIcon } from "@workspace/ui/components/marker";
import { cn } from "@workspace/ui/lib/utils";

export interface AnnotationOverlayProps {
  /**
   * Inline label for the anchor marker — the one-line "the agent noted
   * something here" indicator rendered at the attention item. Required: an
   * overlay with no anchor label is invisible.
   */
  readonly label: string;
  /**
   * The annotation body shown on hover-expand. Markdown/structured content is
   * the caller's concern; this renders ReactNode. Deliberate agent output
   * (visible working commentary), never a promise of raw internal reasoning.
   */
  readonly body: ReactNode;
  /** Optional one-line context shown above the body (e.g. the passage excerpt). */
  readonly title?: string;
  /** Optional meta line shown below the body (e.g. "sigil-annotate · just now"). */
  readonly meta?: ReactNode;
  /** Optional leading glyph on the marker. Defaults to a pin-style indicator. */
  readonly icon?: ReactNode;
  /** Visual emphasis. `note` (default) is quiet; `highlight` is primary-weighted. */
  readonly kind?: "note" | "highlight";
  /** Extra className on the marker trigger. */
  readonly className?: string;
  /** Extra className on the hover popup content. */
  readonly contentClassName?: string;
}

/**
 * A floating annotation: a Marker trigger that expands on hover to show the
 * agent's note about the anchored subject. One overlay per annotation; the host
 * mounts one beside each resolved attention item.
 *
 * Accessibility: the marker is the trigger (HoverCard manages focus/keyboard);
 * the body is rendered in a Popup that base-ui keeps in the accessibility tree
 * when open. A non-hover path (keyboard focus) opens the same content.
 */
export function AnnotationOverlay({
  label,
  body,
  title,
  meta,
  icon,
  kind = "note",
  className,
  contentClassName,
}: AnnotationOverlayProps) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Marker
            variant="border"
            className={cn(
              "cursor-default rounded-md px-2 py-1 transition-colors hover:bg-muted",
              kind === "highlight" && "text-primary",
              className,
            )}
          >
            <MarkerIcon>{icon}</MarkerIcon>
            <MarkerContent className="font-medium">{label}</MarkerContent>
          </Marker>
        }
      />
      <HoverCardContent
        className={cn(
          "max-w-sm space-y-2 p-3 text-xs leading-relaxed",
          contentClassName,
        )}
      >
        {title ? (
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        ) : null}
        <div>{body}</div>
        {meta ? (
          <p className="pt-1 text-[10px] text-muted-foreground">{meta}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
