// Route: /sidebar (legacy compatibility redirect)
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell and global providers
//   apps/web/src/routes/sidebar.index.tsx — THIS FILE; no visible chrome
// Content: redirects old sidebar-shell bookmarks to the canonical studio route

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/sidebar/")({
  beforeLoad: () => {
    throw redirect({ to: "/studio", replace: true })
  },
})
