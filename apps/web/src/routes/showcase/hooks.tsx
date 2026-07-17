// Route: /showcase/hooks
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/hooks.tsx — THIS FILE
// Content: HooksShowcase — useBoundedVector interaction demos, debounce/cooldown/interval timing demos, SSR/resize/mobile/screenshot utility demos

import { createFileRoute } from "@tanstack/react-router"
import { HooksShowcase } from "@/components/showcase/hooks"

export const Route = createFileRoute("/showcase/hooks")({
  component: HooksShowcase,
})
