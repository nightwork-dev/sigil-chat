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
  isNonEmptySlug,
  kebabCase,
  randomSlugSuffix,
  type ProjectRegistry,
  type RegistryUpsertOptions,
  withRegistryRecordLock,
} from "./project-registry"

const WORKSPACE_NAMESPACE = "sigil-chat.workspaces.v1"
const MAX_SLUG_MINT_ATTEMPTS = 10

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
  /**
   * Short, immutable, URL-friendly alias for `id` — kebab-case of `name` at
   * mint time, suffixed with a short base36 tag only on collision. Globally
   * unique across every workspace (some resolution paths — e.g. the shallow
   * /workspaces/$id resolver — have no project prefix to scope collisions
   * within). Display/routing alias ONLY: `id` remains the scope key
   * everywhere authorization is concerned. Minted once and never
   * regenerated, including across a rename. Optional in the type (matches
   * `revision?`/`homeScopeId?`) because a pre-migration record may not have
   * one yet; `normalize()` backfills it, same idiom as this file's existing
   * homeScopeId/revision backfill.
   */
  readonly slug?: string
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
        // Immutable once minted: an existing record's slug can never change
        // via upsert, regardless of what the caller's payload carries —
        // enforced here (registry level), not only by the tool-handler
        // policy in containers.ts, so this holds for every caller.
        ...(isNonEmptySlug(current?.slug) ? { slug: current.slug } : {}),
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

  /** Resolves a workspace by its immutable slug. Global across every
   *  workspace — some resolution paths (the shallow /workspaces/$id
   *  resolver) have no project prefix to scope collisions within. */
  getBySlug(slug: string): Workspace | undefined {
    const normalizedSlug = slug.trim().toLowerCase()
    if (!normalizedSlug) return undefined
    for (const { key, value } of this.workspaces.entries()) {
      if (!isStoredWorkspace(value) || value.id !== key) continue
      const workspace = this.normalize(value)
      if (workspace.slug === normalizedSlug) return workspace
    }
    return undefined
  }

  /** The route-boundary resolver (container slugs): tries the exact id
   *  lookup first (an id and a slug never collide as KV keys), then falls
   *  back to slug resolution. Callers redirect to `.slug` when it differs
   *  from what was requested. */
  resolveByRouteParam(candidate: string): Workspace | undefined {
    const trimmed = candidate.trim()
    if (!trimmed) return undefined
    return this.get(trimmed) ?? this.getBySlug(trimmed)
  }

  private normalize(workspace: StoredWorkspace): NormalizedWorkspace {
    const normalized = normalizeWorkspace(workspace)
    const needsSlug = !isNonEmptySlug(normalized.slug)
    const versioned = {
      ...normalized,
      revision: workspace.revision ?? 1,
      ...(needsSlug
        ? { slug: this.mintUniqueSlug(normalized.name, normalized.id) }
        : { slug: normalized.slug!.trim().toLowerCase() }),
    }
    if (
      workspace.homeScopeId === undefined ||
      workspace.revision === undefined ||
      needsSlug
    ) {
      this.workspaces.set(versioned.id, clone(versioned))
    }
    return clone(versioned)
  }

  /** Kebab-case of `name`, uniquified with a short base36 suffix only on
   *  collision. `excludeId` skips the record being normalized itself. */
  private mintUniqueSlug(name: string, excludeId: string): string {
    const base = kebabCase(name) || "workspace"
    const existing = new Set(
      this.workspaces
        .entries()
        .filter(({ key }) => key !== excludeId)
        .map(({ value }) => (isStoredWorkspace(value) ? value.slug : undefined))
        .filter((slug): slug is string => isNonEmptySlug(slug)),
    )
    if (!existing.has(base)) return base
    for (let attempt = 0; attempt < MAX_SLUG_MINT_ATTEMPTS; attempt += 1) {
      const candidate = `${base}-${randomSlugSuffix()}`
      if (!existing.has(candidate)) return candidate
    }
    throw new Error(
      `Could not mint a unique slug for workspace ${excludeId} after ${MAX_SLUG_MINT_ATTEMPTS} attempts.`,
    )
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
    (value.slug === undefined || typeof value.slug === "string") &&
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
  "slug",
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
