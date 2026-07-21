"use client";

// AgentInline (app adapter) — the portable inline variant shell from
// @workspace/ui/agent-variants wired to the app session. The shell owns the
// popover + conversation core (Q5); this file only supplies the session.

import type { ReactNode } from "react";

import { AgentInline as AgentInlineShell } from "@workspace/ui/components/agent-variants";
import { useAppAgentSession } from "@/hooks/use-app-agent-session";

export interface AgentInlineProps {
  /** The trigger element — the thing the agent is "about" (a passage, a node). */
  readonly children: ReactNode;
  /** What this inline panel is about (composer placeholder). */
  readonly subject: string;
  /** Extra className on the trigger wrapper. */
  readonly className?: string;
  /** Popover alignment against the trigger. */
  readonly align?: "start" | "center" | "end";
  /** Popover side. */
  readonly side?: "top" | "bottom" | "left" | "right";
}

/**
 * A transient agent popover anchored to a trigger element. The trigger is the
 * subject; clicking it opens a compact conversation focused on that subject.
 * Use for "ask about this specific thing" interactions on a canvas.
 */
export function AgentInline({
  children,
  subject,
  className,
  align = "center",
  side = "bottom",
}: AgentInlineProps) {
  const session = useAppAgentSession();

  return (
    <AgentInlineShell
      align={align}
      className={className}
      session={session}
      side={side}
      subject={subject}
    >
      {children}
    </AgentInlineShell>
  );
}
