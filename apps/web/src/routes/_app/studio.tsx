// Route: /studio (legacy redirect)
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/studio.tsx   — THIS FILE
// Content: compatibility redirect to the canonical authenticated /demos/studio route

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/studio")({
  beforeLoad: () => {
    throw redirect({ to: "/demos/studio" })
  },
})
