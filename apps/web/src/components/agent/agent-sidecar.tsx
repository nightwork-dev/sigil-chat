"use client";

// AgentSidecar (app adapter) — the portable sidecar shell from
// @workspace/ui/agent-variants wired to the app session + the app's
// approval-mode toggle and /chat expand link. Presentation lives in the
// design system (Q5); this file only supplies app wiring.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import { AgentSidecar as AgentSidecarShell } from "@workspace/ui/components/agent-variants";
import { useAppAgentSession } from "@/hooks/use-app-agent-session";
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval";

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
    <AgentSidecarShell
      className={className}
      footer={
        <ApprovalModeToggle
          mode={approvalMode}
          onChange={setToolApprovalMode}
        />
      }
      headerAction={
        hideExpand ? undefined : (
          <Link
            to="/chat"
            aria-label="Open in chat"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpRightIcon className="size-4" />
          </Link>
        )
      }
      placeholder={placeholder}
      session={session}
      subject={subject}
      subjectDetail={subjectDetail}
    />
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
