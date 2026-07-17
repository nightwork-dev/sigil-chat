// Route: /showcase
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx  — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker, command menu (Cmd+K)
//   apps/web/src/routes/showcase/index.tsx — THIS FILE
// Content: ShowcaseLanding — identity line, setup card, category grid, search trigger

import { createFileRoute } from "@tanstack/react-router"
import { ShowcaseLanding } from "@/components/showcase/landing"

export const Route = createFileRoute("/showcase/")({
  component: ShowcaseLanding,
})
