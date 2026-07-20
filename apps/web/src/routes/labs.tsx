// Route: /labs layout
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.tsx   — THIS FILE
// Chrome: none — experimental labs deliberately render outside the authenticated product shell
// Provides: a shared route boundary for the labs index and individual experiments

import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/labs")({
  component: LabsLayout,
})

function LabsLayout() {
  return <Outlet />
}
