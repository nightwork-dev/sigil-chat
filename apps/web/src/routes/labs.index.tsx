// Route: /labs
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.tsx    — experimental labs boundary (no visible chrome)
//   apps/web/src/routes/labs.index.tsx — THIS FILE
// Content: LabsIndex — compact directory for the isolated gaze and hands experiments

import { createFileRoute } from "@tanstack/react-router"

import { LabsIndex } from "@/features/labs/labs-index"

export const Route = createFileRoute("/labs/")({
  component: LabsIndexRoute,
})

function LabsIndexRoute() {
  // Resolved (never redirected) by the /labs layout: gated cards render only
  // for authenticated visitors; the local-only studies show either way.
  const { user } = Route.useRouteContext()
  return <LabsIndex authenticated={user !== null} />
}
