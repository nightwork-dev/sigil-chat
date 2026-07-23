// Route: /projects/$projectId (layout)
// Tree:
//   apps/web/src/routes/__root.tsx                         — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx                            — one-rail product shell, breadcrumb bar, theme picker
//   apps/web/src/routes/_app/projects/$projectId/route.tsx  — THIS FILE
// Content: Project layout — owns project-scoped container context and stays
// mounted while the principal moves between the project home, project-level
// sessions, and every workspace nested beneath this project. Renders <Outlet/>.
// Loader: gates on scope-home access, and warms the agent roster + thread
// list every child of this project shares. A loader failure never blocks
// navigation — component-level hooks still fetch on their own if the
// prefetch didn't land.
//
// Container slugs (SC.10, CRITICAL BOUNDARY): $projectId is either the
// canonical slug or a legacy/UUID id. resolveProjectRouteParam resolves it
// against the nav summary FIRST; scopeHomeAccessQueryOptions (and every
// other scope-keyed query in this tree) is built from the resolved
// CANONICAL id, never the raw param — a slug must never reach the
// work-items scope-access surface. The URL-correcting redirect itself lives
// in index.tsx (the leaf owns its full, unambiguous param set); this layout
// only needs to resolve correctly for its own loader.

import { createFileRoute, Outlet } from "@tanstack/react-router"

import { agentRosterQueryOptions } from "@/lib/agent-profile"
import { agentThreadsQueryOptions } from "@/lib/agent-threads"
import { resolveProjectRouteParam } from "@/lib/container-route-target"
import { projectWorkspaceNavQueryOptions } from "@/lib/project-workspace-nav"
import { scopeHomeAccessQueryOptions } from "@/lib/work-items"

export const Route = createFileRoute("/_app/projects/$projectId")({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    const nav = await context.queryClient
      .ensureQueryData(projectWorkspaceNavQueryOptions(principalId))
      .catch(() => undefined)
    const projectId =
      resolveProjectRouteParam(nav, params.projectId)?.id ?? params.projectId
    await Promise.all([
      context.queryClient
        .ensureQueryData(scopeHomeAccessQueryOptions(principalId, projectId))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(agentRosterQueryOptions(principalId))
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData(agentThreadsQueryOptions(principalId))
        .catch(() => undefined),
    ])
  },
  component: () => <Outlet />,
})
