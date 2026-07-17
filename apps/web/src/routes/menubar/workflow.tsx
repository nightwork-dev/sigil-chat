// Route: /menubar/workflow
// Tree:  __root.tsx → menubar.tsx → menubar/workflow.tsx
// Chrome: menubar shell (File/Edit/View/Help + tab nav + theme picker)
// Content: WorkflowView — DAG node editor

import { createFileRoute } from "@tanstack/react-router"
import { WorkflowView } from "@workspace/ui/components/views/workflow"

export const Route = createFileRoute("/menubar/workflow")({
  component: WorkflowView,
})
