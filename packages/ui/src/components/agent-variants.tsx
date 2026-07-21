"use client";

// Agent presentation variants (PRODUCT-CHROME-REWORK-SPEC §3.6) — one agent
// session, many presentations. The dock floats globally (see agent-hud.tsx);
// these are the sibling shells for in-flow and transient regions. Every
// variant wraps the same AgentHudConversation core and takes the session by
// PROP, so the shells stay app-agnostic (Q5): an app passes its own session
// hook's result; the shells never import app wiring.
//
// The AGENT_VARIANTS registry maps a variant name to its shell so any surface
// can declare "inline the agent here, as a sidecar" without owning the
// conversation. Subject binding is the caller's job — compose inside an
// <AttentionProvider context={subject}> (the differentiator, per the spec).

import { useState, type ReactNode } from "react";

import type { AgentRuntimeSession } from "@zigil/agent-surface";

import { AgentHudConversation } from "@workspace/ui/components/agent-hud";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";

// ─── AgentSidecar ────────────────────────────────────────────────────────────
// Persistent in-flow panel beside a focused subject (split-pane companion).

export interface AgentSidecarProps {
  /** The one app session, from the caller's own hook. */
  readonly session: AgentRuntimeSession;
  /** What this sidecar is about (the subject). Shown in the header. */
  readonly subject: string;
  /** Optional detail line under the subject (e.g. the passage excerpt). */
  readonly subjectDetail?: ReactNode;
  /** Placeholder for the composer. Defaults to a subject-aware prompt. */
  readonly placeholder?: string;
  /** Optional header action (e.g. an "open in chat" link) — app-owned. */
  readonly headerAction?: ReactNode;
  /** Optional footer region (e.g. the app's approval-mode toggle). */
  readonly footer?: ReactNode;
  /** Extra className on the panel. */
  readonly className?: string;
}

export function AgentSidecar({
  session,
  subject,
  subjectDetail,
  placeholder,
  headerAction,
  footer,
  className,
}: AgentSidecarProps) {
  return (
    <aside
      aria-label={`Agent: ${subject}`}
      className={cn(
        "flex min-h-0 flex-col border-l border-border bg-card/40",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Agent
          </p>
          <p className="truncate text-sm font-medium">{subject}</p>
          {subjectDetail ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {subjectDetail}
            </p>
          ) : null}
        </div>
        {headerAction}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AgentHudConversation
          placeholder={
            placeholder ??
            `Ask about ${subject.toLowerCase()}, or request a change…`
          }
          session={session}
        />
      </div>
      {footer ? (
        <div className="border-t border-border px-4 py-2">{footer}</div>
      ) : null}
    </aside>
  );
}

// ─── AgentInline ─────────────────────────────────────────────────────────────
// Transient, anchored to a target element/selection — "ask about THIS thing".

export interface AgentInlineProps {
  /** The one app session, from the caller's own hook. */
  readonly session: AgentRuntimeSession;
  /** What this inline panel is about (composer placeholder). */
  readonly subject: string;
  /** The trigger element — the thing the agent is "about". */
  readonly children: ReactNode;
  /** Extra className on the trigger wrapper. */
  readonly className?: string;
  /** Popover alignment against the trigger. */
  readonly align?: "start" | "center" | "end";
  /** Popover side. */
  readonly side?: "top" | "bottom" | "left" | "right";
}

export function AgentInline({
  session,
  subject,
  children,
  className,
  align = "center",
  side = "bottom",
}: AgentInlineProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <span
            className={cn(
              "inline-flex cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          >
            {children}
          </span>
        }
      />
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="max-h-80 overflow-y-auto">
          <AgentHudConversation
            placeholder={`Ask about ${subject.toLowerCase()}…`}
            session={session}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Variant registry ────────────────────────────────────────────────────────
// name → shell, so a surface declares the variant and composes it against its
// subject without re-implementing the conversation (Q5). `dock` is owned by
// agent-hud.tsx (FloatingDock) and listed for completeness; `strip` (ambient
// digest) is a documented future variant (Q4 — deferred).

export const AGENT_VARIANTS = {
  dock: {
    description: "Floating, detachable bottom-right dock — the shell default.",
    component: null, // AgentHud.Root in agent-hud.tsx (FloatingDock shell)
  },
  sidecar: {
    description: "Persistent in-flow panel beside a focused subject.",
    component: AgentSidecar,
  },
  inline: {
    description: "Transient popover anchored to a target element or selection.",
    component: AgentInline,
  },
} as const;

export type AgentVariantName = keyof typeof AGENT_VARIANTS;
