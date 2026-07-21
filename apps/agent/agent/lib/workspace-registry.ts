import { join } from "node:path"

import { createScope } from "@gonk/scope"
import {
  createStoreProvider,
  mirkBackendFactory,
  resolveStoreDir,
} from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

import {
  RegistryRevisionConflictError,
  type ProjectRegistry,
  type RegistryUpsertOptions,
  withRegistryRecordLock,
} from "./project-registry"

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
  readonly revision?: number
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
  private readonly lockDirectory: string | undefined

  constructor(options: WorkspaceRegistryOptions) {
    this.projects = options.projects
    if (options.store) {
      this.workspaces = options.store
      this.lockDirectory = undefined
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
    this.lockDirectory = join(
      resolveStoreDir(scope, "project", WORKSPACE_NAMESPACE),
      ".record-locks",
    )
  }

  get(id: string): Workspace | undefined {
    assertIdentifier("workspace id", id)
    const value = this.workspaces.get(id)
    if (value === undefined) return undefined
    if (!isStoredWorkspace(value) || value.id !== id) {
      throw new Error(`Workspace registry is corrupt for ${id}.`)
    }
    return this.normalize(value)
  }

  list(projectId?: string): Workspace[] {
    if (projectId !== undefined) assertIdentifier("project id", projectId)
    return this.workspaces
      .entries()
      .map(({ key, value }) => {
        if (!isStoredWorkspace(value) || value.id !== key) {
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

  upsert(workspace: Workspace, options: RegistryUpsertOptions = {}): Workspace {
    const normalized = normalizeWorkspace(workspace)
    assertWorkspace(normalized)
    if (!this.projects.get(normalized.homeScopeId)) {
      throw new Error(`Unknown project id: ${normalized.homeScopeId}.`)
    }
    return withRegistryRecordLock(this.lockDirectory, normalized.id, () => {
      const current = this.get(normalized.id)
      assertExpectedRevision(normalized.id, current, options.expectedRevision)
      const next = {
        ...normalized,
        revision:
          options.expectedRevision !== undefined
            ? (current?.revision ?? 0) + 1
            : (normalized.revision ?? current?.revision ?? 1),
      }
      this.workspaces.set(normalized.id, clone(next))
      const persisted = this.get(normalized.id)
      if (!persisted) {
        throw new Error(
          `Workspace record did not persist for ${normalized.id}.`,
        )
      }
      return persisted
    })
  }

  private normalize(workspace: StoredWorkspace): NormalizedWorkspace {
    const normalized = normalizeWorkspace(workspace)
    const versioned = { ...normalized, revision: workspace.revision ?? 1 }
    if (
      workspace.homeScopeId === undefined ||
      workspace.revision === undefined
    ) {
      this.workspaces.set(versioned.id, clone(versioned))
    }
    return clone(versioned)
  }
}

export function isWorkspace(value: unknown): value is Workspace {
  return isStoredWorkspace(value)
}

type StoredWorkspace = Omit<Workspace, "homeScopeId" | "revision"> & {
  readonly homeScopeId?: string
  readonly revision?: number
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
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
    isIdentifier(value.createdBy) &&
    isOptionalRevision(value.revision)
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
  "revision",
] as const

function assertWorkspace(value: Workspace): asserts value is Workspace {
  if (!isWorkspace(value)) throw new Error("Workspace record is invalid.")
}

function normalizeWorkspace(workspace: StoredWorkspace): NormalizedWorkspace {
  const homeScopeId = workspace.homeScopeId ?? workspace.projectId
  if (workspace.projectId !== homeScopeId) {
    throw new Error(
      "Workspace project id must remain its canonical home during compatibility migration.",
    )
  }
  return { ...workspace, homeScopeId }
}

function assertExpectedRevision(
  id: string,
  current: Workspace | undefined,
  expectedRevision: number | undefined,
): void {
  if (expectedRevision === undefined) return
  if (current?.revision !== expectedRevision) {
    throw new RegistryRevisionConflictError(
      id,
      expectedRevision,
      current?.revision,
    )
  }
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

function isOptionalRevision(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  )
}

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value))
    throw new Error(`Workspace ${label} must be non-empty.`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
