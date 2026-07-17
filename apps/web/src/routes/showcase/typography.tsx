// Route: /showcase/typography
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/typography.tsx — THIS FILE
// Content: TypographyShowcase — font stack, headings, type scale, weights, semantic text colors

import { createFileRoute } from "@tanstack/react-router"
import { TypographyShowcase } from "@/components/showcase/typography"

export const Route = createFileRoute("/showcase/typography")({
  component: TypographyShowcase,
})
