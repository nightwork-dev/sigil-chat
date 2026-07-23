// Route: /projects/$projectId/workspaces/$workspaceId (layout)
// Tree:
//   apps/web/src/routes/__root.tsx                                              — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                                                — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx                      — project layout
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/route.tsx — THIS FILE
// Content: Workspace layout — owns workspace-scoped container context and
// stays mounted while the principal moves session→session inside this
// workspace. Renders <Outlet/>.

import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_app/projects/$projectId/workspaces/$workspaceId",
)({
  component: () => <Outlet />,
})
