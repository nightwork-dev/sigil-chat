// S1.9 — the persistent agent affordance.
//
// One HUD, mounted once in the _app shell (below the auth boundary, inside the
// app-global agent session and the shell WorkspaceAttentionProvider), so the
// agent is reachable from EVERY workspace and always carries the current room's
// attention. This replaces the per-workspace HUD mount that used to live only
// in Studio. The conversation is the same session/thread as /chat — the panel's
// AgentChat reads the app-global session from context, so it's one thread in
// every room, and the Expand affordance jumps to /chat on that same thread.
//
// This increment lands the floating-panel tier. The full presentation
// continuum (omnibar → floating → docked → half-screen → /chat) and per-user
// geometry persistence build on this mount in the following S1.9 increments.

import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { AgentHud } from "@/components/agent/agent-hud"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"

export function ShellAgentHud() {
  const [open, setOpen] = useState(false)
  const approvalMode = useToolApprovalMode()

  return (
    <AgentHud.Root
      className="fixed bottom-4 right-4 z-40 max-sm:inset-x-2 max-sm:bottom-2 max-sm:right-auto"
      onOpenChange={setOpen}
      open={open}
    >
      <AgentHud.Trigger />
      <AgentHud.Panel
        navigationTarget={<Link to="/chat" />}
        chatProps={{
          approvalMode,
          onApprovalModeChange: setToolApprovalMode,
          placeholder: "Ask the agent, or tell it to use a Gonk tool…",
        }}
      />
    </AgentHud.Root>
  )
}
