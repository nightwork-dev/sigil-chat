// Route: /showcase/timeline
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/timeline.tsx — THIS FILE
// Content: TimelineShowcase — Timeline/Gantt compound, its own route (large/complex feature, same tier as Graph)

import { createFileRoute } from "@tanstack/react-router"
import { TimelineShowcase } from "@/components/showcase/timeline"

export const Route = createFileRoute("/showcase/timeline")({
  component: TimelineShowcase,
})
