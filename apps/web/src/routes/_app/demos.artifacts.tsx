// Route: /demos/artifacts
// Tree:
//   apps/web/src/routes/__root.tsx              — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx                — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.artifacts.tsx — THIS FILE
// Content: ArtifactWorkspace — authenticated artifact and provenance demonstration

import { createFileRoute } from "@tanstack/react-router"

import { ArtifactWorkspace } from "@/features/artifacts/artifact-workspace"

export const Route = createFileRoute("/_app/demos/artifacts")({
  component: ArtifactWorkspace,
})
