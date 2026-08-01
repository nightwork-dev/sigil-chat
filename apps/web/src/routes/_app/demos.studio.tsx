// Route: /demos/studio
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx             — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.studio.tsx — THIS FILE
// Content: ReducerStudio — authenticated reducer-graph and agent-projection demonstration
// Guard: server-evaluated `surfaces.reducerStudio` feature flag (FLAG.1) —
// redirects to /demos when an owner has turned the demo off. Re-evaluated on
// every navigation through fetchFeatureFlags(), so an owner's toggle takes
// effect for every principal without a deploy.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { ReducerStudio } from "@/features/studio/reducer-studio"
import { fetchFeatureFlags } from "@/lib/feature-flags"

export const Route = createFileRoute("/_app/demos/studio")({
  beforeLoad: async () => {
    const { flags } = await fetchFeatureFlags()
    const reducerStudio = flags.find((flag) => flag.id === "surfaces.reducerStudio")
    // Absence reads as enabled rather than refusing navigation over a
    // registry lookup that failed for an unrelated reason — the flag's own
    // default-off behavior is for an id nobody declared, not for a declared
    // flag whose row didn't come back.
    if (reducerStudio && !reducerStudio.enabled) {
      throw redirect({ to: "/demos" })
    }
  },
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
