import { createHash } from "node:crypto"
import {
  mkdirSync,
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { createScope } from "@gonk/scope"
import {
  createStoreProvider,
  mirkBackendFactory,
  resolveStoreDir,
} from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const PROJECT_NAMESPACE = "sigil-chat.projects.v1"
const LOCK_TIMEOUT_MS = 2_000
const HARD_STALE_LOCK_MS = 60_000

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
  readonly id: string
  readonly expectedRevision: number
  readonly actualRevision: number | undefined

  constructor(
    id: string,
    expectedRevision: number,
    actualRevision: number | undefined,
  ) {
    super(
      `Project ${id} revision conflict: expected ${expectedRevision}, found ${
        actualRevision ?? "none"
      }.`,
    )
    this.id = id
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

/**
 * Mirk-backed, authoritative project records. The registry deliberately has no
 * per-user seed: projects are created explicitly, rather than silently
 * inventing a personal project outside the PROJ.2 thread-binding flow.
 */
export class ProjectRegistry {
  private readonly projects: KvStore<unknown>
  private readonly lockDirectory: string | undefined

  constructor(options: ProjectRegistryOptions = {}) {
    if (options.store) {
      this.projects = options.store
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
    this.projects = provider.kv("project", PROJECT_NAMESPACE)
    this.lockDirectory = join(
      resolveStoreDir(scope, "project", PROJECT_NAMESPACE),
      ".record-locks",
    )
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
    return withRegistryRecordLock(this.lockDirectory, project.id, () => {
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
    })
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

export function withRegistryRecordLock<T>(
  lockDirectory: string | undefined,
  id: string,
  operation: () => T,
): T {
  if (lockDirectory === undefined) return operation()

  mkdirSync(lockDirectory, { recursive: true })
  const lockName = createHash("sha256").update(id).digest("hex")
  const lockPath = join(lockDirectory, `${lockName}.lock`)
  const deadline = Date.now() + LOCK_TIMEOUT_MS

  while (Date.now() < deadline) {
    let descriptor: number
    try {
      descriptor = openSync(lockPath, "wx")
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error
      if (reapStaleLock(lockPath)) continue
      waitForLock()
      continue
    }

    try {
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
        "utf8",
      )
      return operation()
    } finally {
      try {
        closeSync(descriptor)
      } finally {
        rmSync(lockPath, { force: true })
      }
    }
  }

  throw new Error(
    `Could not acquire the registry record lock for ${id} within ${LOCK_TIMEOUT_MS}ms.`,
  )
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

function reapStaleLock(lockPath: string): boolean {
  let raw: string
  let modifiedAt: number
  try {
    raw = readFileSync(lockPath, "utf8")
    modifiedAt = statSync(lockPath).mtimeMs
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return true
    throw error
  }

  const metadata = parseLockMetadata(raw)
  const now = Date.now()
  const staleByAge =
    now - modifiedAt > HARD_STALE_LOCK_MS ||
    (metadata !== undefined && now - metadata.createdAt > HARD_STALE_LOCK_MS)
  const heldByDeadProcess =
    metadata !== undefined && isProcessDead(metadata.pid)
  if (!staleByAge && !heldByDeadProcess) return false

  try {
    rmSync(lockPath)
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw error
  }
  return true
}

function parseLockMetadata(
  raw: string,
): { pid: number; createdAt: number } | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value) ||
      typeof value.pid !== "number" ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt)
    ) {
      return undefined
    }
    return { pid: value.pid, createdAt: value.createdAt }
  } catch {
    return undefined
  }
}

function isProcessDead(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return isErrorCode(error, "ESRCH")
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function waitForLock(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
