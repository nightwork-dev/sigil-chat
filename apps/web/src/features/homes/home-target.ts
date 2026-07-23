// Where the side nav's static "Home" entry lands, given the active
// perspective. The NavModel is flat and static by contract, so perspective
// awareness lives in this redirect: the most specific home wins — an active
// workspace goes to its nested home under the active project (SC.10 §2:
// entered-via IS the path prefix, so no `?via=` is ever needed here),
// otherwise the active project home, otherwise the personal project.

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

export interface HomeTargetSelection {
  readonly projectId: string | undefined
  readonly workspaceId: string | undefined
}

export function homeTarget(
  selection: HomeTargetSelection,
  nav: ProjectWorkspaceNavSummary,
): string {
  const projectId = selection.projectId ?? nav.personalProjectId
  if (selection.workspaceId) {
    const workspace = nav.workspaces.find(
      (entry) => entry.id === selection.workspaceId,
    )
    if (!workspace) return `/projects/${projectId}`
    return `/projects/${projectId}/workspaces/${workspace.id}`
  }
  return `/projects/${projectId}`
}
