// Route: /showcase/tweak
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/tweak.tsx — THIS FILE
// Content: TweakShowcase — scrubber, compact slider, XY pad

import { createFileRoute } from "@tanstack/react-router"
import { TweakShowcase } from "@/components/showcase/tweak"

export const Route = createFileRoute("/showcase/tweak")({
  component: TweakShowcase,
})
