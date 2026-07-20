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
  readonly members: readonly ProjectMember[]
  readonly settings: Record<string, unknown>
  readonly createdAt: string
  readonly createdBy: string
}

export interface ProjectRegistryOptions {
  cwd?: string
  projectRoot?: string
  store?: KvStore<unknown>
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
    if (!isProject(value) || value.id !== id) {
      throw new Error(`Project registry is corrupt for ${id}.`)
    }
    return clone(value)
  }

  list(): Project[] {
    return this.projects
      .entries()
      .map(({ key, value }) => {
        if (!isProject(value) || value.id !== key) {
          throw new Error(`Project registry is corrupt for ${key}.`)
        }
        return clone(value)
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  upsert(project: Project): Project {
    assertProject(project)
    this.projects.set(project.id, clone(project))
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
}

export function isProject(value: unknown): value is Project {
  if (!isRecord(value) || !hasOnlyKeys(value, projectKeys)) return false
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.name) &&
    typeof value.description === "string" &&
    Array.isArray(value.members) &&
    value.members.every(isProjectMember) &&
    hasUniquePrincipalIds(value.members) &&
    isRecord(value.settings) &&
    isJsonValue(value.settings) &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy)
  )
}

const projectKeys = [
  "id",
  "name",
  "description",
  "members",
  "settings",
  "createdAt",
  "createdBy",
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

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value))
    throw new Error(`Project ${label} must be non-empty.`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
