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

import { createFileRoute, Outlet } from "@tanstack/react-router"

import { agentRosterQueryOptions } from "@/lib/agent-profile"
import { agentThreadsQueryOptions } from "@/lib/agent-threads"
import { scopeHomeAccessQueryOptions } from "@/lib/work-items"

export const Route = createFileRoute("/_app/projects/$projectId")({
  loader: async ({ context, params }) => {
    const principalId = context.user.id
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          scopeHomeAccessQueryOptions(principalId, params.projectId),
        )
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
