import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

import { type ProjectRegistry } from "./project-registry"

const WORKSPACE_NAMESPACE = "sigil-chat.workspaces.v1"

export type WorkspaceStatus = "active" | "archived"

export interface Workspace {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly status: WorkspaceStatus
  readonly createdAt: string
  readonly createdBy: string
}

export interface WorkspaceRegistryOptions {
  cwd?: string
  projectRoot?: string
  projects: Pick<ProjectRegistry, "get">
  store?: KvStore<unknown>
}

/**
 * Mirk-backed, authoritative workspace records. A workspace cannot outlive
 * its containing project: upserts reject a project id the project registry
 * does not recognize.
 */
export class WorkspaceRegistry {
  private readonly projects: Pick<ProjectRegistry, "get">
  private readonly workspaces: KvStore<unknown>

  constructor(options: WorkspaceRegistryOptions) {
    this.projects = options.projects
    if (options.store) {
      this.workspaces = options.store
      return
    }

    const scope = createScope({
      cwd: options.cwd ?? process.cwd(),
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.workspaces = provider.kv("project", WORKSPACE_NAMESPACE)
  }

  get(id: string): Workspace | undefined {
    assertIdentifier("workspace id", id)
    const value = this.workspaces.get(id)
    if (value === undefined) return undefined
    if (!isWorkspace(value) || value.id !== id) {
      throw new Error(`Workspace registry is corrupt for ${id}.`)
    }
    return clone(value)
  }

  list(projectId?: string): Workspace[] {
    if (projectId !== undefined) assertIdentifier("project id", projectId)
    return this.workspaces
      .entries()
      .map(({ key, value }) => {
        if (!isWorkspace(value) || value.id !== key) {
          throw new Error(`Workspace registry is corrupt for ${key}.`)
        }
        return clone(value)
      })
      .filter(
        (workspace) =>
          projectId === undefined || workspace.projectId === projectId,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  upsert(workspace: Workspace): Workspace {
    assertWorkspace(workspace)
    if (!this.projects.get(workspace.projectId)) {
      throw new Error(`Unknown project id: ${workspace.projectId}.`)
    }
    this.workspaces.set(workspace.id, clone(workspace))
    const persisted = this.get(workspace.id)
    if (!persisted) {
      throw new Error(`Workspace record did not persist for ${workspace.id}.`)
    }
    return persisted
  }
}

export function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value) || !hasOnlyKeys(value, workspaceKeys)) return false
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.projectId) &&
    isIdentifier(value.name) &&
    typeof value.description === "string" &&
    (value.status === "active" || value.status === "archived") &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy)
  )
}

const workspaceKeys = [
  "id",
  "projectId",
  "name",
  "description",
  "status",
  "createdAt",
  "createdBy",
] as const

function assertWorkspace(value: Workspace): asserts value is Workspace {
  if (!isWorkspace(value)) throw new Error("Workspace record is invalid.")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value))
    throw new Error(`Workspace ${label} must be non-empty.`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
