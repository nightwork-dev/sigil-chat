// Route: /roadmap
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/roadmap.tsx  — THIS FILE
// Content: RoadmapHub — peer Board, Graph (dependency view), and Specs views over the durable roadmap store, with story review/editing and specification lifecycle/linkage

import { createFileRoute, redirect } from "@tanstack/react-router"

import { RoadmapHub, type RoadmapView } from "@/features/roadmap/roadmap-hub"

export const Route = createFileRoute("/_app/roadmap")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { view: RoadmapView; story?: string; spec?: string } => ({
    view:
      search.view === "specs" || search.view === "graph"
        ? search.view
        : "board",
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
      // Each view remounts on the deep link IT consumes, and only that one.
      // Board and Specs take their selection as initial state, so a changed
      // `?story=`/`?spec=` has to remount them. The graph holds its own
      // selection and writes the URL back — keying it on `?story=` tore the
      // canvas down and refitted the viewport on every single node click.
      key={
        view === "graph"
          ? "graph"
          : view === "specs"
            ? `specs:${spec ?? ""}`
            : `board:${story ?? ""}`
      }
      viewer={user}
      view={view}
      initialStoryId={story}
      initialSpecId={spec}
    />
  )
}
