"use client";

// AgentSidecar — the in-flow agent panel, beside a focused subject.
//
// One of the presentation variants from PRODUCT-CHROME-REWORK-SPEC.md §3.6. The
// dock floats (every route); the sidecar sits IN FLOW next to a subject — e.g.
// Review's right rail beside the selected passage, or a focused artifact view.
// Same one session (read from context via useAppAgentSession); the variant is
// about WHERE the conversation renders, not a second conversation.
//
// Subject binding (the differentiator per the spec): a sidecar composes inside
// an <AttentionProvider context={subject}> so the agent's context is the focused
// subject. The sidecar itself just renders the conversation core + a header
// identifying what it's about — the attention plumbing is the caller's job.
//
// One active presentation per shell-owned region (§4.1): a surface mounts a
// sidecar in its content region INSTEAD of relying on the shell dock for that
// subject. The shell suppresses its dock where a region owns a sidecar.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import { AgentHudConversation } from "@workspace/ui/components/agent-hud";
import { useAppAgentSession } from "@/hooks/use-app-agent-session";
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval";
import { cn } from "@workspace/ui/lib/utils";

export interface AgentSidecarProps {
  /** What this sidecar is about (the subject). Shown in the header. */
  readonly subject: string;
  /** Optional detail line under the subject (e.g. the passage excerpt). */
  readonly subjectDetail?: ReactNode;
  /** Placeholder for the composer. Defaults to a subject-aware prompt. */
  readonly placeholder?: string;
  /** Extra className on the panel. */
  readonly className?: string;
  /** Hide the "open in chat" link (defaults to shown). */
  readonly hideExpand?: boolean;
}

/**
 * A persistent in-flow agent panel. Renders the conversation core (transcript +
 * composer) inside an attention-bound region. The caller wraps this in an
 * <AttentionProvider> so the agent shares the focused subject's context.
 */
export function AgentSidecar({
  subject,
  subjectDetail,
  placeholder,
  className,
  hideExpand,
}: AgentSidecarProps) {
  const session = useAppAgentSession();
  const approvalMode = useToolApprovalMode();

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
        {!hideExpand ? (
          <Link
            to="/chat"
            aria-label="Open in chat"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpRightIcon className="size-4" />
          </Link>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AgentHudConversation
          placeholder={
            placeholder ?? `Ask about ${subject.toLowerCase()}, or request a change…`
          }
          session={session}
        />
      </div>
      <div className="border-t border-border px-4 py-2">
        <ApprovalModeToggle
          mode={approvalMode}
          onChange={setToolApprovalMode}
        />
      </div>
    </aside>
  );
}

function ApprovalModeToggle({
  mode,
  onChange,
}: {
  mode: ReturnType<typeof useToolApprovalMode>;
  onChange: (next: ReturnType<typeof useToolApprovalMode>) => void;
}) {
  // Compact approval-mode hint; the full control lives in settings. Kept quiet
  // so the sidecar reads as a conversation, not a config panel.
  return (
    <button
      type="button"
      onClick={() => onChange(mode === "always" ? "ask" : "always")}
      className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
    >
      Tool approval: {mode === "always" ? "auto-allow" : "ask each time"}
    </button>
  );
}
