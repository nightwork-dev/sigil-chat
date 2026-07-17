// Route: /showcase/displays
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx → collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/displays.tsx — THIS FILE
// Content: DisplaysShowcase — LCD, nixie, LED segment, oscilloscope

import { createFileRoute } from "@tanstack/react-router"
import { DisplaysShowcase } from "@/components/showcase/displays"

export const Route = createFileRoute("/showcase/displays")({
  component: DisplaysShowcase,
})
