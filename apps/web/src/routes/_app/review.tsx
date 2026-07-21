// Route: /review (legacy redirect)
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/review.tsx   — THIS FILE
// Content: compatibility redirect to the canonical authenticated /demos/review route

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/review")({
  beforeLoad: () => {
    throw redirect({ to: "/demos/review" })
  },
})
