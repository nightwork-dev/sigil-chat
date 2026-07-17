// Route: /review
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/review.tsx   — THIS FILE
// Content: ReviewWorkspace — selectable manuscript reader with review workbench and an attention-aware agent HUD

import { createFileRoute } from "@tanstack/react-router"

import { ReviewWorkspace } from "@/features/review/review-workspace"

export const Route = createFileRoute("/_app/review")({
  component: ReviewWorkspace,
})
