// Route: /showcase/temporal
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/temporal.tsx — THIS FILE
// Content: TemporalShowcase — the story-time display set (era-band, time-scrubber; attention-tile demoed here, categorized under feedback)

import { createFileRoute } from "@tanstack/react-router"
import { TemporalShowcase } from "@/components/showcase/temporal"

export const Route = createFileRoute("/showcase/temporal")({
  component: TemporalShowcase,
})
