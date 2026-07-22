// Route: /roadmap
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/roadmap.tsx  — THIS FILE
// Content: RoadmapHub — peer Board and Specs views over the durable roadmap store, with story review/editing and specification lifecycle/linkage

import { createFileRoute, redirect } from "@tanstack/react-router"

import { RoadmapHub, type RoadmapView } from "@/features/roadmap/roadmap-hub"

export const Route = createFileRoute("/_app/roadmap")({
  validateSearch: (search: Record<string, unknown>): { view: RoadmapView; story?: string; spec?: string } => ({
    view: search.view === "specs" ? "specs" : "board",
    ...(typeof search.story === "string" ? { story: search.story } : {}),
    ...(typeof search.spec === "string" ? { spec: search.spec } : {}),
  }),
  beforeLoad: () => {
    if (
      !import.meta.env.DEV &&
      import.meta.env.VITE_SIGIL_INTERNAL_WORKSPACES !== "1"
    ) {
      throw redirect({ to: "/chat" })
    }
  },
  component: RoadmapRoute,
})

function RoadmapRoute() {
  const { user } = Route.useRouteContext()
  const { view, story, spec } = Route.useSearch()
  return (
    <RoadmapHub
      key={`${view}:${story ?? ""}:${spec ?? ""}`}
      viewer={user}
      view={view}
      initialStoryId={story}
      initialSpecId={spec}
    />
  )
}
