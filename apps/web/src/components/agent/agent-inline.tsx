"use client";

// AgentInline — the transient, anchor-targeted agent variant.
//
// One of the presentation variants from PRODUCT-CHROME-REWORK-SPEC.md §3.6.
// Where the dock floats globally and the sidecar sits in a persistent region,
// the inline variant is TRANSIENT and ANCHORED — it opens a compact
// conversation at a specific target element (a canvas component, a selection).
// Think "ask about THIS thing" popping a small panel beside it.
//
// Subject binding: the caller wraps the trigger region in an <AttentionProvider>
// so the agent's context is the anchored subject. This component just renders
// the trigger + popover; the attention plumbing is the caller's job.
//
// One active presentation per shell-owned region (§4.1). An inline popover is
// its own transient region — it doesn't collide with the dock (different slots).

import { useState, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { AgentHudConversation } from "@workspace/ui/components/agent-hud";
import { useAppAgentSession } from "@/hooks/use-app-agent-session";
import { cn } from "@workspace/ui/lib/utils";

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
  const [open, setOpen] = useState(false);
  const session = useAppAgentSession();

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
