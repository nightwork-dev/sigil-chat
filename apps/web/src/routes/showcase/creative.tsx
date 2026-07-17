// Route: /showcase/creative
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/creative.tsx — THIS FILE
// Content: CreativeShowcase — color wheel, gradient editor, piano roll, ring buffer, terminal, tree view

import { createFileRoute } from "@tanstack/react-router"
import { CreativeShowcase } from "@/components/showcase/creative"

export const Route = createFileRoute("/showcase/creative")({
  component: CreativeShowcase,
})
