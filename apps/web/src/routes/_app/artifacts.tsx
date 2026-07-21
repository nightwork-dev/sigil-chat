// Route: /artifacts (legacy redirect)
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx             — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/artifacts.tsx   — THIS FILE
// Content: compatibility redirect to the canonical authenticated /demos/artifacts route

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/artifacts")({
  beforeLoad: () => {
    throw redirect({ to: "/demos/artifacts" })
  },
})
