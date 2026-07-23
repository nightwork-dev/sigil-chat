// Route: /chat  (RESOLVER)
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/chat.tsx    — THIS FILE
// Content: no longer a distinct chat surface (SC.10 §3.1/§6 step 8) — the
// session leaf IS the chat now. `beforeLoad` resolves the active thread
// (the app-global active-thread preference; falling back to the most
// recently updated thread when no preference is set) and `throw redirect`s
// into that thread's canonical nested session URL, using its slug (session
// slugs, SC.10) — never the raw UUID id. `useAgentThreads` always returns at
// least one thread — the server seeds a default-persona thread for a
// principal with none (agent-thread-bindings.server.ts `ensureActive`) — so
// this always has somewhere to land; there is no "create" branch to write
// here.

import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  activeAgentThreadPreferenceQueryOptions,
  agentThreadsQueryOptions,
} from "@/lib/agent-threads"
import { projectWorkspaceNavQueryOptions } from "@/lib/project-workspace-nav"
import {
  chatResolverRedirectTarget,
  pickActiveThread,
} from "@/lib/session-route-target"

export const Route = createFileRoute("/_app/chat")({
  beforeLoad: async ({ context }) => {
    const principalId = context.user.id
    const [threads, preference, nav] = await Promise.all([
      context.queryClient.ensureQueryData(
        agentThreadsQueryOptions(principalId, false),
      ),
      context.queryClient
        .ensureQueryData(activeAgentThreadPreferenceQueryOptions(principalId))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
        .catch(() => undefined),
    ])
    // agentThreadsQueryOptions(principalId, false) always resolves at least
    // one thread server-side; if the fetch itself failed there is nothing
    // safe to redirect to — render nothing rather than loop.
    if (threads.length === 0) return

    const target = pickActiveThread(threads, preference?.activeThreadId)
    throw redirect(chatResolverRedirectTarget(target, nav))
  },
})
