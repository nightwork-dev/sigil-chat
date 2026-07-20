// Route: /artifacts
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx             — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/artifacts.tsx   — THIS FILE
// Content: ArtifactWorkspace — scope-aware browser for existing Gonk artifacts, their previews, and recorded provenance

import { createFileRoute } from "@tanstack/react-router"

import { ArtifactWorkspace } from "@/features/artifacts/artifact-workspace"

export const Route = createFileRoute("/_app/artifacts")({
  component: ArtifactWorkspace,
})
