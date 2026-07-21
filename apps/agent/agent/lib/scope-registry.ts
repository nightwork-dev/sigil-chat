import type { Project, ProjectRegistry } from "./project-registry"
import {
  INSTALLATION_SCOPE_ID,
  type InstallationScope,
  type PersonalScope,
  type PersonalScopeRegistry,
} from "./personal-scope"
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
    private readonly personalScopes?: Pick<
      PersonalScopeRegistry,
      "get" | "ensureInstallation"
    >,
  ) {}

  get(id: string): ScopeRecord | undefined {
    if (id === INSTALLATION_SCOPE_ID) {
      const installation = this.personalScopes?.ensureInstallation()
      return installation ? installationScopeRecord(installation) : undefined
    }
    const project = this.projects.get(id)
    if (project) return projectScope(project)
    const workspace = this.workspaces.get(id)
    if (workspace) return workspaceScope(workspace)
    const personalScope = this.personalScopes?.get(id)
    return personalScope ? personalScopeRecord(personalScope) : undefined
  }
}

function installationScopeRecord(scope: InstallationScope): ScopeRecord {
  return {
    id: scope.id,
    kind: scope.kind,
    name: scope.name,
    description: scope.description,
    status: scope.status,
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

function personalScopeRecord(scope: PersonalScope): ScopeRecord {
  return {
    id: scope.id,
    kind: "personal",
    name: scope.name,
    description: scope.description,
    homeScopeId: scope.homeScopeId,
    status: scope.status,
  }
}
