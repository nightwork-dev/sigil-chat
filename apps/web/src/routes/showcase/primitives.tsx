// Route: /showcase/primitives
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/primitives.tsx — THIS FILE
// Content: PrimitivesShowcase — dense reference sheet of stock shadcn primitives
// not otherwise curated elsewhere in /showcase (Accordion, Calendar, Carousel, etc.)

import { createFileRoute } from "@tanstack/react-router"
import { PrimitivesShowcase } from "@/components/showcase/primitives"

export const Route = createFileRoute("/showcase/primitives")({
  component: PrimitivesShowcase,
})
