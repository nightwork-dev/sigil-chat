// Route: /footer
// Tree:  __root.tsx → footer.tsx → footer/index.tsx
// Chrome: footer shell (header + tab nav + status strip + theme picker)
// Content: DashboardView — stat cards, charts, data table

import { createFileRoute } from "@tanstack/react-router"
import { DashboardView } from "@workspace/ui/components/views/dashboard"

export const Route = createFileRoute("/footer/")({
  component: DashboardView,
})
