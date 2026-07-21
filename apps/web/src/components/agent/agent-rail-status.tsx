"use client"

// AgentRailStatus — the bottom rail's right-side agent region: the agent's
// session status, a one-line summary of the attention it currently sees, and
// the full context inspector (ContextTray) one click away. This restores the
// always-visible "what is the agent exposed to" surface that used to live
// only inside /chat's header — now it's on every route.

import { useAttention } from "@/components/agent/workspace-attention"
import { ContextTray } from "@/components/agent/context-tray"
import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { cn } from "@workspace/ui/lib/utils"

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  submitted: "Sending",
  streaming: "Streaming",
  error: "Error",
}

export function AgentRailStatus() {
  const session = useAppAgentSession()
  const attention = useAttention()

  const subject =
    attention?.selection?.label ?? attention?.workspace?.label ?? null

  return (
    <span className="flex items-center gap-2">
      <span
        aria-label={`Agent ${STATUS_LABEL[session.status] ?? session.status}`}
        className={cn(
          "size-1.5 rounded-full",
          session.status === "streaming" || session.status === "submitted"
            ? "animate-pulse bg-primary"
            : session.status === "error"
              ? "bg-destructive"
              : "bg-muted-foreground/50",
        )}
        title={`Agent ${STATUS_LABEL[session.status] ?? session.status}`}
      />
      {subject ? (
        <span className="max-w-48 truncate" title={subject}>
          {subject}
        </span>
      ) : (
        <span className="text-muted-foreground/70">no context</span>
      )}
      <ContextTray.Root attention={attention ?? null}>
        <ContextTray.Trigger className="h-5 px-1.5 text-[10px]" />
        <ContextTray.Content />
      </ContextTray.Root>
    </span>
  )
}
