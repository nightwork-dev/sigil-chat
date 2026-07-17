// Route: /showcase/review
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/review.tsx — THIS FILE
// Content: ReviewShowcase — the agent↔human review loop from @workspace/review
//          (decisions queue, annotation composer, review-debt triage, acceptance
//          gate, and the workbench Sheet/Drawer that gathers them)

import { createFileRoute } from "@tanstack/react-router"
import { ReviewShowcase } from "@/components/showcase/review"

export const Route = createFileRoute("/showcase/review")({
  component: ReviewShowcase,
})
