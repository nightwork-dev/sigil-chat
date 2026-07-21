"use client";

// AmbientPanel — the translucent working-commentary surface.
//
// A movable text panel that is transparent by default and DARKENS on hover, or
// when the agent is typing (session streaming). It is a projection TARGET for
// reasoning/text parts (per AGENT-OUTPUT-PROJECTION-SPEC.md §3.3) — the agent's
// VISIBLE WORKING COMMENTARY surfaces here quietly rather than in a transcript.
//
// This is NOT a promise of raw internal reasoning. The product surfaces
// deliberate agent output (commentary, activity), and the panel's quiet default
// is about not dominating attention — not about exposing private thought.
//
// The two spec'd behaviors (translucency + darken-on-hover/streaming) are the
// V1 surface. Movability (drag-to-reposition) composes a drag layer on top when
// a surface needs it; this component stays positioning-agnostic (the caller
// places it) so it can be used fixed, absolutely-positioned, or wrapped in a
// DnD context without coupling.

import { type ReactNode } from "react";

import { useAgentRuntimeSessionOptional } from "@zigil/agent-react/session";

import { cn } from "@workspace/ui/lib/utils";

export interface AmbientPanelProps {
  /** The commentary content. Typically reasoning/text parts projected here. */
  readonly children: ReactNode;
  /**
   * Force the active (darkened) state. When undefined, the panel darkens on
   * hover or when the session is streaming (agent typing) — the spec'd default.
   */
  readonly active?: boolean;
  /** Optional accessible label for the panel region. */
  readonly label?: string;
  /** Extra className. */
  readonly className?: string;
}

/**
 * Translucent by default; darkens on hover or when the agent session is
 * streaming. The session is read from context (useAgentRuntimeSession), so the
 * panel must mount inside an agent session provider (as the dock does).
 */
export function AmbientPanel({
  children,
  active,
  label = "Agent working commentary",
  className,
}: AmbientPanelProps) {
  // Optional: degrades gracefully outside a session provider (e.g. a static
  // showcase). When a session IS present, darkens automatically on streaming.
  const session = useAgentRuntimeSessionOptional();
  const isStreaming = session?.status === "streaming";
  // `active` (explicit) wins; otherwise derive from session + hover (hover via
  // CSS group-data below, so the SSR/initial paint is quiet).
  const isActive = active ?? isStreaming;

  return (
    <div
      aria-label={label}
      data-active={isActive ? "" : undefined}
      data-streaming={isStreaming ? "" : undefined}
      className={cn(
        "group/ambient rounded-lg border border-border/40 p-3 text-xs leading-relaxed text-muted-foreground backdrop-blur-sm transition-colors duration-300",
        // Quiet default: translucent. The border/bg are faint so the panel
        // recedes when the agent isn't producing output.
        "bg-background/30",
        // Darken on hover OR when active (streaming/explicit). hover: raises the
        // same surface the active state does, so the two triggers feel unified.
        "hover:bg-background/85 hover:text-foreground hover:border-border",
        isActive && "bg-background/85 text-foreground border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
