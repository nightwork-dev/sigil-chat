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
//
// Container slugs (SC.10, CRITICAL BOUNDARY): $workspaceId is either the
// canonical slug or a legacy/UUID id — resolved against the nav summary
// before scopeHomeAccessQueryOptions ever sees it. The URL-correcting
// redirect lives in index.tsx (the leaf owns the full, unambiguous param
// set for both $projectId and $workspaceId); this layout only needs to
// resolve correctly for its own loader.

import { createFileRoute, Outlet } from "@tanstack/react-router"

import { agentThreadsQueryOptions } from "@/lib/agent-threads"
import { resolveWorkspaceRouteParam } from "@/lib/container-route-target"
import { projectWorkspaceNavQueryOptions } from "@/lib/project-workspace-nav"
import { scopeHomeAccessQueryOptions } from "@/lib/work-items"

export const Route = createFileRoute(
  "/_app/projects/$projectId/workspaces/$workspaceId",
)({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    const nav = await context.queryClient
      .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
      .catch(() => undefined)
    const workspaceId =
      resolveWorkspaceRouteParam(nav, params.workspaceId)?.id ??
      params.workspaceId
    await Promise.all([
      context.queryClient
        .ensureQueryData(scopeHomeAccessQueryOptions(principalId, workspaceId))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(agentThreadsQueryOptions(principalId))
        .catch(() => undefined),
    ])
  },
  component: () => <Outlet />,
})
