// Route: /menubar
// Tree:  __root.tsx → menubar.tsx → menubar/index.tsx
// Chrome: menubar shell (File/Edit/View/Help + tab nav + theme picker)
// Content: DashboardView — stat cards, charts, data table

import { createFileRoute } from "@tanstack/react-router"
import { DashboardView } from "@workspace/ui/components/views/dashboard"

export const Route = createFileRoute("/menubar/")({
  component: DashboardView,
})
