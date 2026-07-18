// Route: /roadmap
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/roadmap.tsx  — THIS FILE
// Content: RoadmapWorkspace — story status board with an editor panel and David's review queue, reconciled through the work-items domain-outcome loop

import { createFileRoute } from "@tanstack/react-router"

import { RoadmapWorkspace } from "@/features/roadmap/roadmap-workspace"

export const Route = createFileRoute("/_app/roadmap")({
  component: RoadmapWorkspace,
})
