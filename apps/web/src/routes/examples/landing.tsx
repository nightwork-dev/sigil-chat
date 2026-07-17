// Route: /examples/landing
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx         — /examples layout: global nav strip across the example genres; owns page scroll (another agent)
//   apps/web/src/routes/examples/landing.tsx — THIS FILE
// Content: LandingExample — single-scroll marketing page (no internal scroll region; the parent outlet scrolls it)

import { createFileRoute } from "@tanstack/react-router"
import { LandingExample } from "@/components/examples/landing-example"

export const Route = createFileRoute("/examples/landing")({
  component: LandingExample,
})
