// Route: /demos
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx            — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.index.tsx — THIS FILE
// Content: DemosIndex — authenticated directory for agent-backed product demonstrations
// Surface mounting: the loader resolves declared feature flags (FLAG.1) so a
// card for a demo an owner has turned off is never listed here — the same
// verdict the /demos/studio route guard enforces if reached directly.

import { createFileRoute } from "@tanstack/react-router"

import { DemosIndex } from "@/features/demos/demos-index"
import { fetchFeatureFlags } from "@/lib/feature-flags"

export const Route = createFileRoute("/_app/demos/")({
  loader: async () => (await fetchFeatureFlags()).flags,
  component: DemosRoute,
})

function DemosRoute() {
  const flags = Route.useLoaderData()
  return <DemosIndex flags={flags} />
}
