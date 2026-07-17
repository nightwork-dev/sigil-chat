// Route: /showcase/constraints
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/constraints.tsx — THIS FILE
// Content: ConstraintsShowcase — range slider, pinnable track, area/capped/curve/segment viz, node diagram, data peek

import { createFileRoute } from "@tanstack/react-router"
import { ConstraintsShowcase } from "@/components/showcase/constraints"

export const Route = createFileRoute("/showcase/constraints")({
  component: ConstraintsShowcase,
})
