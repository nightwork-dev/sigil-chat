import type { Project, ProjectRegistry } from "./project-registry"
import type { Workspace, WorkspaceRegistry } from "./workspace-registry"
import type { ScopeKind } from "./scope-graph"

export interface ScopeRecord {
  readonly id: string
  readonly kind: ScopeKind
  readonly name: string
  readonly description?: string
  readonly homeScopeId?: string
  readonly status: "active" | "archived"
}

/**
 * A read-only projection of the records this first slice materializes. It is
 * deliberately not an authority layer: callers still authorize separately.
 */
export class ProjectWorkspaceScopeRegistry {
  constructor(
    private readonly projects: Pick<ProjectRegistry, "get">,
    private readonly workspaces: Pick<WorkspaceRegistry, "get">,
  ) {}

  get(id: string): ScopeRecord | undefined {
    const project = this.projects.get(id)
    if (project) return projectScope(project)
    const workspace = this.workspaces.get(id)
    return workspace ? workspaceScope(workspace) : undefined
  }
}

function projectScope(project: Project): ScopeRecord {
  return {
    id: project.id,
    kind: "project",
    name: project.name,
    description: project.description,
    status: "active",
  }
}

function workspaceScope(workspace: Workspace): ScopeRecord {
  return {
    id: workspace.id,
    kind: "workspace",
    name: workspace.name,
    description: workspace.description,
    homeScopeId: workspace.homeScopeId,
    status: workspace.status,
  }
}
