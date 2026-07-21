// Route: /home — the side nav's static Home entry, resolved against the
// active perspective. The NavModel is flat and static by contract, so the
// perspective awareness lives here: most specific home wins (workspace →
// its home with the via rule applied; else the active project; else the
// personal project).

import { createFileRoute, Navigate } from "@tanstack/react-router"

import { useActiveContainer } from "@/lib/active-container"
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav"
import { homeTarget } from "@/features/homes/home-target"
import { HomeSkeleton } from "@/features/homes/home-states"

export const Route = createFileRoute("/_app/home")({
  component: HomeRedirectRoute,
})

function HomeRedirectRoute() {
  const container = useActiveContainer()
  const nav = useProjectWorkspaceNav()

  if (!container.isReady || !nav.data) return <HomeSkeleton />
  return (
    <Navigate
      to={homeTarget(
        {
          projectId: container.projectId,
          workspaceId: container.workspaceId,
        },
        nav.data,
      )}
    />
  )
}
