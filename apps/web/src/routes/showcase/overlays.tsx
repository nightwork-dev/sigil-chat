// Route: /showcase/overlays
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/overlays.tsx — THIS FILE
// Content: OverlaysShowcase — transient surfaces summoned over the page (command menu, command palette, combobox, radial context menu, responsive popover/drawer)

import { createFileRoute } from "@tanstack/react-router"
import { OverlaysShowcase } from "@/components/showcase/overlays"

export const Route = createFileRoute("/showcase/overlays")({
  component: OverlaysShowcase,
})
