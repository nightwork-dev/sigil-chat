import { fileURLToPath } from "node:url"

import { ProjectRegistry } from "./project-registry"
import { ScopeLinkRegistry } from "./scope-link-registry"
import { ProjectWorkspaceScopeRegistry } from "./scope-registry"
import { WorkspaceRegistry } from "./workspace-registry"

const agentDirectory = fileURLToPath(new URL("..", import.meta.url))
const localStorageRoot = fileURLToPath(new URL("../../.data", import.meta.url))

export interface ProjectWorkspaceRegistries {
  projects: ProjectRegistry
  workspaces: WorkspaceRegistry
  scopes: ProjectWorkspaceScopeRegistry
  links: ScopeLinkRegistry
}

let registries: ProjectWorkspaceRegistries | undefined

/**
 * Both the web proof issuer and Gonk registry load these stores through this
 * module. Anchoring their Mirk project scope to the agent's local data root
 * keeps the two service processes on the same authoritative project/workspace
 * records without sharing the harness's own state database. Construction is
 * lazy so importing tool contracts does not open Mirk's SQLite store.
 */
export function getProjectWorkspaceRegistries(): ProjectWorkspaceRegistries {
  if (registries) return registries
  const storageRoot = resolveProjectWorkspaceStorageRoot()
  const projects = new ProjectRegistry({
    cwd: agentDirectory,
    projectRoot: storageRoot,
  })
  const workspaces = new WorkspaceRegistry({
      cwd: agentDirectory,
      projectRoot: storageRoot,
      projects,
  })
  const scopes = new ProjectWorkspaceScopeRegistry(projects, workspaces)
  registries = {
    projects,
    workspaces,
    scopes,
    links: new ScopeLinkRegistry({
      cwd: agentDirectory,
      projectRoot: storageRoot,
      scopes,
    }),
  }
  return registries
}

export function resolveProjectWorkspaceStorageRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.SIGIL_CONTAINER_REGISTRY_ROOT?.trim()
  return configured || localStorageRoot
}
