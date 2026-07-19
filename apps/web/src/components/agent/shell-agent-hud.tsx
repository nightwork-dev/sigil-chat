// S1.9 — the persistent agent affordance.
//
// One HUD, mounted once in the _app shell (below the auth boundary, inside the
// app-global agent session and the shell WorkspaceAttentionProvider), so the
// agent is reachable from EVERY workspace and always carries the current room's
// attention. The conversation is the same session/thread as /chat — the panel's
// AgentChat reads the app-global session from context, so it's one thread in
// every room, and the Expand affordance jumps to /chat on that same thread.
//
// The compact HUD is a clean conversation surface: the heavy context inspector
// and per-turn status live on the roomy /chat view, not this small panel.

import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import { AgentHud } from "@/components/agent/agent-hud"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"

export function ShellAgentHud() {
  const [open, setOpen] = useState(false)
  const approvalMode = useToolApprovalMode()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  // Redundant on /chat — that route IS the full agent conversation, so the
  // floating "Ask your agent" affordance has nothing to add there.
  if (pathname === "/chat") return null

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
          // Keep the compact panel clean — the context inspector belongs on
          // the full /chat view where there's room (and out of the narrow
          // toolbar, where it collided with the session switcher).
          showContextPrivacy: false,
          placeholder: "Ask the agent, or tell it to use a Gonk tool…",
        }}
      />
    </AgentHud.Root>
  )
}
