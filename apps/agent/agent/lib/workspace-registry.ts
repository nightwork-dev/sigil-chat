import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

import { type ProjectRegistry } from "./project-registry"

const WORKSPACE_NAMESPACE = "sigil-chat.workspaces.v1"

export type WorkspaceStatus = "active" | "archived"

export interface Workspace {
  readonly id: string
  /**
   * Compatibility mirror for callers that still speak strict project-tree
   * containment. New code should resolve canonical ownership through
   * homeScopeId; composition belongs in ScopeLink records.
   */
  readonly projectId: string
  /** The workspace's singular canonical home. */
  readonly homeScopeId?: string
  readonly name: string
  readonly description: string
  /** Visual identity in the chrome (see Project.icon). */
  readonly icon?: string
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

type NormalizedWorkspace = Workspace & { readonly homeScopeId: string }

/**
 * Mirk-backed, authoritative workspace records. Older projectId-only records
 * are read, upgraded in place with the same id, and written back with their
 * canonical home. projectId remains an additive compatibility mirror while
 * adjacent consumers migrate away from strict containment.
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
    return this.normalize(value)
  }

  list(projectId?: string): Workspace[] {
    if (projectId !== undefined) assertIdentifier("project id", projectId)
    return this.workspaces
      .entries()
      .map(({ key, value }) => {
        if (!isWorkspace(value) || value.id !== key) {
          throw new Error(`Workspace registry is corrupt for ${key}.`)
        }
        return this.normalize(value)
      })
      .filter(
        (workspace) =>
          projectId === undefined || workspace.homeScopeId === projectId,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  upsert(workspace: Workspace): Workspace {
    const normalized = normalizeWorkspace(workspace)
    assertWorkspace(normalized)
    if (!this.projects.get(normalized.homeScopeId)) {
      throw new Error(`Unknown project id: ${normalized.homeScopeId}.`)
    }
    this.workspaces.set(normalized.id, clone(normalized))
    const persisted = this.get(normalized.id)
    if (!persisted) {
      throw new Error(`Workspace record did not persist for ${normalized.id}.`)
    }
    return persisted
  }

  private normalize(workspace: Workspace): NormalizedWorkspace {
    const normalized = normalizeWorkspace(workspace)
    if (workspace.homeScopeId === undefined) {
      this.workspaces.set(normalized.id, clone(normalized))
    }
    return normalized
  }
}

export function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value) || !hasOnlyKeys(value, workspaceKeys)) return false
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.projectId) &&
    (value.homeScopeId === undefined || isIdentifier(value.homeScopeId)) &&
    isIdentifier(value.name) &&
    typeof value.description === "string" &&
    (value.icon === undefined || typeof value.icon === "string") &&
    (value.status === "active" || value.status === "archived") &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy)
  )
}

const workspaceKeys = [
  "id",
  "projectId",
  "homeScopeId",
  "name",
  "description",
  "icon",
  "status",
  "createdAt",
  "createdBy",
] as const

function assertWorkspace(value: Workspace): asserts value is Workspace {
  if (!isWorkspace(value)) throw new Error("Workspace record is invalid.")
}

function normalizeWorkspace(workspace: Workspace): NormalizedWorkspace {
  const homeScopeId = workspace.homeScopeId ?? workspace.projectId
  if (workspace.projectId !== homeScopeId) {
    throw new Error(
      "Workspace project id must remain its canonical home during compatibility migration.",
    )
  }
  return { ...workspace, homeScopeId }
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
