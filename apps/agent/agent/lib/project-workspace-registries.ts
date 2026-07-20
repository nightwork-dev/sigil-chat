import { fileURLToPath } from "node:url"

import { ProjectRegistry } from "./project-registry"
import { WorkspaceRegistry } from "./workspace-registry"

const agentDirectory = fileURLToPath(new URL("..", import.meta.url))
const storageRoot = fileURLToPath(new URL("../../.data", import.meta.url))

export interface ProjectWorkspaceRegistries {
  projects: ProjectRegistry
  workspaces: WorkspaceRegistry
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
  const projects = new ProjectRegistry({
    cwd: agentDirectory,
    projectRoot: storageRoot,
  })
  registries = {
    projects,
    workspaces: new WorkspaceRegistry({
      cwd: agentDirectory,
      projectRoot: storageRoot,
      projects,
    }),
  }
  return registries
}
