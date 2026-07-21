// Route: /demos/studio
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx             — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.studio.tsx — THIS FILE
// Content: ReducerStudio — authenticated reducer-graph and agent-projection demonstration

import { createFileRoute } from "@tanstack/react-router"

import { ReducerStudio } from "@/features/studio/reducer-studio"

export const Route = createFileRoute("/_app/demos/studio")({
  staticData: {
    rail: {
      chords: [
        { keys: "Scroll", label: "Zoom" },
        { keys: "Drag", label: "Pan" },
      ],
    },
  },
  component: ReducerStudio,
})
