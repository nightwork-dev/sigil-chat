// Route: /showcase/graph
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/graph.tsx — THIS FILE
// Content: GraphShowcase — force-directed knowledge graph

import { createFileRoute } from "@tanstack/react-router"
import { GraphShowcase } from "@/components/showcase/graph"

export const Route = createFileRoute("/showcase/graph")({
  component: GraphShowcase,
})
