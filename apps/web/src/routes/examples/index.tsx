// Route: /examples/
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx  — global nav strip (wordmark + Components/Examples + theme picker)
//   apps/web/src/routes/examples/index.tsx — THIS FILE
// Content: ExamplesGallery — cards linking to every example layout/demo

import { createFileRoute } from "@tanstack/react-router"
import { ExamplesGallery } from "@/components/examples-gallery"

export const Route = createFileRoute("/examples/")({
  component: ExamplesGallery,
})
