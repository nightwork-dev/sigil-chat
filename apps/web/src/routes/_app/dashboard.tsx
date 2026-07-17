// Route: /dashboard
// Tree:
//   apps/web/src/routes/__root.tsx         — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx           — default app shell (collapsible sidebar + breadcrumb bar + theme picker)
//   apps/web/src/routes/_app/dashboard.tsx — THIS FILE
// Content: DashboardView — stat cards, charts, data table
// Demonstrates: server function + route loader with pendingComponent

import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type { StatsData } from "@/routes/-types"
import { DashboardView, DashboardSkeleton } from "@workspace/ui/components/views/dashboard"

const getStats = createServerFn({ method: "GET" }).handler(async (): Promise<StatsData> => {
  // Simulate latency
  await new Promise((r) => setTimeout(r, 600))
  return {
    requests: 12_847,
    latency: 42,
    errorRate: 0.3,
    uptime: 99.98,
    updatedAt: new Date().toISOString(),
  }
})

export const Route = createFileRoute("/_app/dashboard")({
  loader: () => getStats(),
  pendingMs: 0,
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
})

function Dashboard() {
  const stats = Route.useLoaderData()

  return <DashboardView liveStats={stats} />
}
