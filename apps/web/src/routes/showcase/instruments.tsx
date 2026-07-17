// Route: /showcase/instruments
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/instruments.tsx — THIS FILE
// Content: InstrumentsShowcase — knob, fader, LED, toggle, gauge

import { createFileRoute } from "@tanstack/react-router"
import { InstrumentsShowcase } from "@/components/showcase/instruments"

export const Route = createFileRoute("/showcase/instruments")({
  component: InstrumentsShowcase,
})
