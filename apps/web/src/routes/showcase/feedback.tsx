// Route: /showcase/feedback
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/feedback.tsx — THIS FILE
// Content: FeedbackShowcase — components that report system state: status, progress, activity, validation, emptiness, and load/error states (StatusDot, Meter, ValidationMessage, ErrorBoundary, DelayedLoad, notifications)

import { createFileRoute } from "@tanstack/react-router"
import { FeedbackShowcase } from "@/components/showcase/feedback"

export const Route = createFileRoute("/showcase/feedback")({
  component: FeedbackShowcase,
})
