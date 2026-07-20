// Route: /roadmap
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/roadmap.tsx  — THIS FILE
// Content: RoadmapWorkspace — story status board with an editor panel and the installation owner's review queue, reconciled through the work-items domain-outcome loop

import { createFileRoute, redirect } from "@tanstack/react-router"

import { RoadmapWorkspace } from "@/features/roadmap/roadmap-workspace"

export const Route = createFileRoute("/_app/roadmap")({
  beforeLoad: () => {
    if (
      !import.meta.env.DEV &&
      import.meta.env.VITE_SIGIL_INTERNAL_WORKSPACES !== "1"
    ) {
      throw redirect({ to: "/chat" })
    }
  },
  component: RoadmapRoute,
})

function RoadmapRoute() {
  const { user } = Route.useRouteContext()
  return <RoadmapWorkspace viewer={user} />
}
