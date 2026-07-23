// Route: /projects/$projectId/workspaces/$workspaceId (layout)
// Tree:
//   apps/web/src/routes/__root.tsx                                              — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                                                — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx                      — project layout
//   apps/web/src/routes/_app/projects/$projectId/workspaces/$workspaceId/route.tsx — THIS FILE
// Content: Workspace layout — owns workspace-scoped container context and
// stays mounted while the principal moves session→session inside this
// workspace. Renders <Outlet/>. Loader: gates on scope-home access for this
// workspace and warms the sibling-session list (shared thread list, same
// query key as the project layout — dedups against an in-flight fetch).

import { createFileRoute, Outlet } from "@tanstack/react-router"

import { agentThreadsQueryOptions } from "@/lib/agent-threads"
import { scopeHomeAccessQueryOptions } from "@/lib/work-items"

export const Route = createFileRoute(
  "/_app/projects/$projectId/workspaces/$workspaceId",
)({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          scopeHomeAccessQueryOptions(principalId, params.workspaceId),
        )
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(agentThreadsQueryOptions(principalId))
        .catch(() => undefined),
    ])
  },
  component: () => <Outlet />,
})
