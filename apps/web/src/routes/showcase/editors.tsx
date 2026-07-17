// Route: /showcase/editors
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/editors.tsx — THIS FILE
// Content: EditorsShowcase — large text/data editing compounds (template resolver, JSON/JSON5/YAML editor)

import { createFileRoute } from "@tanstack/react-router"
import { EditorsShowcase } from "@/components/showcase/editors"

export const Route = createFileRoute("/showcase/editors")({
  component: EditorsShowcase,
})
