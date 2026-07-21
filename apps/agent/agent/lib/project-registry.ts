import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const PROJECT_NAMESPACE = "sigil-chat.projects.v1"

export type ProjectMemberRole = "owner" | "member"

export interface ProjectMember {
  readonly principalId: string
  readonly role: ProjectMemberRole
}

export interface Project {
  readonly id: string
  readonly name: string
  readonly description: string
  /**
   * Visual identity for the container in the chrome (breadcrumb switcher,
   * omnibar). An emoji or short glyph; an avatar-blob path (the persona
   * portrait pattern) is a documented follow-up when one is needed.
   */
  readonly icon?: string
  readonly members: readonly ProjectMember[]
  readonly settings: Record<string, unknown>
  readonly createdAt: string
  readonly createdBy: string
  readonly revision?: number
}

export interface ProjectRegistryOptions {
  cwd?: string
  projectRoot?: string
  store?: KvStore<unknown>
}

export interface RegistryUpsertOptions {
  readonly expectedRevision?: number
}

export class RegistryRevisionConflictError extends Error {
  constructor(
    readonly id: string,
    readonly expectedRevision: number,
    readonly actualRevision: number | undefined,
  ) {
    super(
      `Project ${id} revision conflict: expected ${expectedRevision}, found ${
        actualRevision ?? "none"
      }.`,
    )
  }
}

/**
 * Mirk-backed, authoritative project records. The registry deliberately has no
 * per-user seed: projects are created explicitly, rather than silently
 * inventing a personal project outside the PROJ.2 thread-binding flow.
 */
export class ProjectRegistry {
  private readonly projects: KvStore<unknown>

  constructor(options: ProjectRegistryOptions = {}) {
    if (options.store) {
      this.projects = options.store
      return
    }

    const scope = createScope({
      cwd: options.cwd ?? process.cwd(),
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.projects = provider.kv("project", PROJECT_NAMESPACE)
  }

  get(id: string): Project | undefined {
    assertIdentifier("project id", id)
    const value = this.projects.get(id)
    if (value === undefined) return undefined
    if (!isStoredProject(value) || value.id !== id) {
      throw new Error(`Project registry is corrupt for ${id}.`)
    }
    return this.normalize(value)
  }

  list(): Project[] {
    return this.projects
      .entries()
      .map(({ key, value }) => {
        if (!isStoredProject(value) || value.id !== key) {
          throw new Error(`Project registry is corrupt for ${key}.`)
        }
        return this.normalize(value)
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  upsert(project: Project, options: RegistryUpsertOptions = {}): Project {
    assertProject(project)
    const current = this.get(project.id)
    assertExpectedRevision(project.id, current, options.expectedRevision)
    const next = {
      ...project,
      revision:
        options.expectedRevision !== undefined
          ? (current?.revision ?? 0) + 1
          : (project.revision ?? current?.revision ?? 1),
    }
    this.projects.set(project.id, clone(next))
    const persisted = this.get(project.id)
    if (!persisted) {
      throw new Error(`Project record did not persist for ${project.id}.`)
    }
    return persisted
  }

  hasMember(projectId: string, principalId: string): boolean {
    assertIdentifier("project id", projectId)
    assertIdentifier("principal id", principalId)
    return (
      this.get(projectId)?.members.some(
        (member) => member.principalId === principalId,
      ) ?? false
    )
  }

  hasOwner(projectId: string, principalId: string): boolean {
    assertIdentifier("project id", projectId)
    assertIdentifier("principal id", principalId)
    return (
      this.get(projectId)?.members.some(
        (member) =>
          member.principalId === principalId && member.role === "owner",
      ) ?? false
    )
  }

  private normalize(project: StoredProject): Project {
    const normalized = { ...project, revision: project.revision ?? 1 }
    if (project.revision === undefined) {
      this.projects.set(normalized.id, clone(normalized))
    }
    return clone(normalized)
  }
}

export function isProject(value: unknown): value is Project {
  return isStoredProject(value)
}

type StoredProject = Omit<Project, "revision"> & { readonly revision?: number }

function isStoredProject(value: unknown): value is StoredProject {
  if (!isRecord(value) || !hasOnlyKeys(value, projectKeys)) return false
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.name) &&
    typeof value.description === "string" &&
    (value.icon === undefined || typeof value.icon === "string") &&
    Array.isArray(value.members) &&
    value.members.every(isProjectMember) &&
    hasUniquePrincipalIds(value.members) &&
    isRecord(value.settings) &&
    isJsonValue(value.settings) &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy) &&
    isOptionalRevision(value.revision)
  )
}

const projectKeys = [
  "id",
  "name",
  "description",
  "icon",
  "members",
  "settings",
  "createdAt",
  "createdBy",
  "revision",
] as const

function assertProject(value: Project): asserts value is Project {
  if (!isProject(value)) throw new Error("Project record is invalid.")
}

function isProjectMember(value: unknown): value is ProjectMember {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["principalId", "role"]) &&
    isIdentifier(value.principalId) &&
    (value.role === "owner" || value.role === "member")
  )
}

function hasUniquePrincipalIds(members: readonly ProjectMember[]): boolean {
  return (
    new Set(members.map((member) => member.principalId)).size === members.length
  )
}

function assertExpectedRevision(
  id: string,
  current: Project | undefined,
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

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
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
    throw new Error(`Project ${label} must be non-empty.`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
