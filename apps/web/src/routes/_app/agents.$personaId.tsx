// Route: /agents/$personaId
// Tree:
//   apps/web/src/routes/__root.tsx               — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx                  — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/agents.$personaId.tsx — THIS FILE
// Content: AgentProfileView — the read-only Agent Studio profile (portrait/
// identity header, self-model, memory panes, sessions). $personaId selects
// the registry-backed persona rendered by the page.

import { createFileRoute } from "@tanstack/react-router"

import { AgentProfileView } from "@/components/agents/agent-profile"
import { agentProfileQueryOptions } from "@/lib/agent-profile"

export const Route = createFileRoute("/_app/agents/$personaId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(agentProfileQueryOptions(params.personaId)),
  component: AgentProfileRoute,
})

function AgentProfileRoute() {
  const { personaId } = Route.useParams()
  return <AgentProfileView personaId={personaId} />
}
