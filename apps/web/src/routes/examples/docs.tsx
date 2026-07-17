// Route: /examples/docs
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx      — /examples layout: global nav strip across the example genres; owns page scroll (another agent)
//   apps/web/src/routes/examples/docs.tsx — THIS FILE
// Content: DocsExample — GuideShell two-pane scroll-spy docs site; owns its own internal scroll, so it fills the outlet height (h-full)

import { createFileRoute } from "@tanstack/react-router"
import { DocsExample } from "@/components/examples/docs-example"

export const Route = createFileRoute("/examples/docs")({
  component: DocsExample,
})
