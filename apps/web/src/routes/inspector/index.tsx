// Route: /inspector
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/inspector.tsx       — InspectorShell (content + right rail, theme picker)
//   apps/web/src/routes/inspector/index.tsx — THIS FILE
// Content: InspectorMain — the main content region the right rail inspects

import { createFileRoute } from "@tanstack/react-router"
import { InspectorMain } from "@workspace/ui/components/layouts/demos"

export const Route = createFileRoute("/inspector/")({
  component: InspectorMain,
})
