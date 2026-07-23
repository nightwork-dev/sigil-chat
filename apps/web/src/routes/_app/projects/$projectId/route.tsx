// Route: /projects/$projectId (layout)
// Tree:
//   apps/web/src/routes/__root.tsx                         — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                            — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx  — THIS FILE
// Content: Project layout — owns project-scoped container context and stays
// mounted while the principal moves between the project home, project-level
// sessions, and every workspace nested beneath this project. Renders <Outlet/>.

import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: () => <Outlet />,
})
