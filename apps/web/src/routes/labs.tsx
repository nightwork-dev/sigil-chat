// Route: /labs layout
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.tsx   — THIS FILE
// Chrome: none — experimental labs deliberately render outside the authenticated product shell
// Provides: a shared route boundary for the labs index and individual experiments
//
// Resource stance: the island is public and local-only. It does not resolve an
// auth session, mount the protected app providers, or expose agent/Gonk demos.

import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/labs")({
  component: LabsLayout,
})

function LabsLayout() {
  return <Outlet />
}
