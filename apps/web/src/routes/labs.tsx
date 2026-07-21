// Route: /labs layout
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.tsx   — THIS FILE
// Chrome: none — experimental labs deliberately render outside the authenticated product shell
// Provides: a shared route boundary for the labs index and individual experiments
//
// Auth stance: the ISLAND is public (the interaction studies are local-only),
// but anything that can touch remote resources (the agent, Gonk tools) must
// not be VISIBLE without auth — the layout resolves the session (never
// redirects) and the index hides gated cards from anonymous visitors.

import { createFileRoute, Outlet } from "@tanstack/react-router"

import { fetchCurrentSession } from "@/lib/auth/route-guard"

export const Route = createFileRoute("/labs")({
  beforeLoad: async () => ({ user: await fetchCurrentSession() }),
  component: LabsLayout,
})

function LabsLayout() {
  return <Outlet />
}
