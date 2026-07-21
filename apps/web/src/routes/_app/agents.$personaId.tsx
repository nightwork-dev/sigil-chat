// Route: /agents/$personaId
// Tree:
//   apps/web/src/routes/__root.tsx               — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx                  — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/agents.$personaId.tsx — THIS FILE
// Content: AgentProfileView — the read-only Agent Studio profile (portrait,
// loaded Eve configuration, self-model, memory panes, and sessions).
// $personaId selects the registry-backed persona rendered by the page.

import { createFileRoute } from "@tanstack/react-router"

import { AgentProfileView } from "@/components/agents/agent-profile"
import {
  agentProfileQueryOptions,
  agentPublicProfileQueryOptions,
} from "@/lib/agent-profile"
import { ManagementTabs } from "@/components/management-tabs"

export const Route = createFileRoute("/_app/agents/$personaId")({
  staticData: { rail: { top: ManagementTabs } },
  loader: ({ context, params }) => {
    // §4.3 — the loader branches on role: the full profile fn is owner-only,
    // so a non-owner's loader must never call it (that was the dead-end).
    // Non-owners preload the reduced projection instead.
    const owner = context.user.role === "owner"
    if (owner) {
      return context.queryClient.ensureQueryData(
        agentProfileQueryOptions(context.user.id, params.personaId),
      )
    }
    return context.queryClient.ensureQueryData(
      agentPublicProfileQueryOptions(context.user.id, params.personaId),
    )
  },
  component: AgentProfileRoute,
})

function AgentProfileRoute() {
  const { personaId } = Route.useParams()
  const { user } = Route.useRouteContext()
  return <AgentProfileView owner={user.role === "owner"} personaId={personaId} />
}
