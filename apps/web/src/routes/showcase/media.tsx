// Route: /showcase/media
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx → collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/media.tsx — THIS FILE
// Content: MediaShowcase — audio player, sound-pack resource gallery

import { createFileRoute } from "@tanstack/react-router"
import { MediaShowcase } from "@/components/showcase/media"

export const Route = createFileRoute("/showcase/media")({
  component: MediaShowcase,
})
