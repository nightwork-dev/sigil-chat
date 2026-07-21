// Route: /demos
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx            — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.index.tsx — THIS FILE
// Content: DemosIndex — authenticated directory for agent- and Gonk-backed product demonstrations

import { createFileRoute } from "@tanstack/react-router"

import { DemosIndex } from "@/features/demos/demos-index"

export const Route = createFileRoute("/_app/demos/")({
  component: DemosIndex,
})
