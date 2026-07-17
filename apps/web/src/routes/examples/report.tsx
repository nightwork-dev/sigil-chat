// Route: /examples/report
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx        — /examples layout: global nav strip across the example genres; owns page scroll (another agent)
//   apps/web/src/routes/examples/report.tsx — THIS FILE
// Content: ReportExample — single-scroll, print-friendly document (no internal scroll region; the parent outlet scrolls it)

import { createFileRoute } from "@tanstack/react-router"
import { ReportExample } from "@/components/examples/report-example"

export const Route = createFileRoute("/examples/report")({
  component: ReportExample,
})
