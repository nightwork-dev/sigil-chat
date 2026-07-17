// Route: /canvas
// Tree:
//   apps/web/src/routes/__root.tsx      — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx        — default app shell (collapsible sidebar + breadcrumb bar + theme picker)
//   apps/web/src/routes/_app/canvas.tsx — THIS FILE
// Content: CanvasView — placeholder for spatial/graph content

import { createFileRoute } from "@tanstack/react-router"
import { CanvasView } from "@workspace/ui/components/views/canvas"

export const Route = createFileRoute("/_app/canvas")({
  component: CanvasView,
})
