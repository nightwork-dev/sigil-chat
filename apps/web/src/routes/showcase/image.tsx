// Route: /showcase/image
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx → collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/image.tsx — THIS FILE
// Content: ImageShowcase — the image primitives (Image, Figure, Compare, Lightbox, Avatar Stack)

import { createFileRoute } from "@tanstack/react-router"
import { ImageShowcase } from "@/components/showcase/image"

export const Route = createFileRoute("/showcase/image")({
  component: ImageShowcase,
})
