// Route: /showcase/layout
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/layout.tsx — THIS FILE
// Content: LayoutShowcase — non-interactive scaffolding that labels, groups, and arranges other components (SectionHeader, DataLabel, ParamRow, ItemRow, ColorSwatch, decorative backgrounds/beams)

import { createFileRoute } from "@tanstack/react-router"
import { LayoutShowcase } from "@/components/showcase/layout"

export const Route = createFileRoute("/showcase/layout")({
  component: LayoutShowcase,
})
