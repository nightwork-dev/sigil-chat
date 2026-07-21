// Route: /demos/review
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx             — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.review.tsx — THIS FILE
// Content: ReviewWorkspace — authenticated document-review and agent-sidecar demonstration

import { createFileRoute } from "@tanstack/react-router"

import { ReviewWorkspace } from "@/features/review/review-workspace"

export const Route = createFileRoute("/_app/demos/review")({
  component: ReviewWorkspace,
})
