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
const MAX_SLUG_MINT_ATTEMPTS = 10
const SLUG_SUFFIX_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

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
  /**
   * Short, immutable, URL-friendly alias for `id` — kebab-case of `name` at
   * mint time, suffixed with a short base36 tag only on collision. Globally
   * unique across every project (the URL carries no further disambiguating
   * prefix). Display/routing alias ONLY: `id` remains the scope key
   * everywhere authorization, scope headers, and artifact scopes are
   * concerned — nothing here changes `id` semantics. Minted once (on first
   * creation) and never regenerated, INCLUDING across a rename — see
   * `upsert()`'s immutability contract. Optional in the type (matches the
   * existing `revision?` precedent in this file) because a pre-migration
   * stored record may not have one yet; `normalize()` backfills it on every
   * read, the same idiom that already backfills `revision`.
   */
  readonly slug?: string
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
    return this.readNormalized(id, value)
  }

  list(): Project[] {
    return this.projects
      .entries()
      .map(({ key, value }) => {
        if (!isStoredProject(value) || value.id !== key) {
          throw new Error(`Project registry is corrupt for ${key}.`)
        }
        return this.readNormalized(key, value)
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  upsert(project: Project, options: RegistryUpsertOptions = {}): Project {
    assertProject(project)
    return withRegistryRecordLock(this.lockDirectory, project.id, () => {
      const current = this.get(project.id)
      assertExpectedRevision(project.id, current, options.expectedRevision)
      // Authz finding (2026-07-23, Annika): id and slug share one
      // namespace, and a caller-supplied id is otherwise unconstrained
      // (minLength:1 only). Without this guard, creating a project whose
      // id equals an existing project's slug lets it shadow that project
      // at the route-resolution boundary (first-match id-or-slug lookup).
      // Only matters at CREATE — an update keeps its own id, so it can't
      // newly collide with anything by upserting.
      if (!current) {
        this.assertIdDoesNotAliasSlug(project.id)
      }
      const next = {
        ...project,
        // Immutable once minted: an existing record's slug can never change
        // via upsert, regardless of what the caller's payload carries —
        // enforced here (registry level), not only by the tool-handler
        // policy in containers.ts, so this holds for every caller.
        ...(isNonEmptySlug(current?.slug) ? { slug: current.slug } : {}),
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

  /** Rejects an id that would alias an EXISTING different record's slug —
   *  the create-time half of the id/slug collision guard (mintUniqueSlug's
   *  existing-id check below is the other half). Only meaningful before the
   *  record exists; `upsert()` only calls this on a fresh create. */
  private assertIdDoesNotAliasSlug(id: string): void {
    for (const { key, value } of this.projects.entries()) {
      if (key === id) continue
      if (!isStoredProject(value)) continue
      if (isNonEmptySlug(value.slug) && value.slug === id) {
        throw new Error(
          `Project id "${id}" collides with an existing project's slug — choose a different id.`,
        )
      }
    }
  }

  /** Fast path for an already-fully-normalized record: no lock, because
   *  nothing here can race — revision and slug are immutable once set, so
   *  concurrent readers agree by construction. Falls through to a LOCKED
   *  backfill only when minting or a revision default is actually needed
   *  (finding 2, 2026-07-23 — see withRegistryRecordLock's reentrancy note
   *  above: this can itself run from inside upsert()'s own lock). */
  private readNormalized(id: string, value: StoredProject): Project {
    if (value.revision !== undefined && isNonEmptySlug(value.slug)) {
      return clone({
        ...value,
        revision: value.revision,
        slug: value.slug.trim().toLowerCase(),
      })
    }
    return withRegistryRecordLock(this.lockDirectory, id, () => {
      // Re-read fresh under the lock: a racer that lost the lock race sees
      // whatever the winner already persisted, instead of computing (and
      // possibly minting a DIFFERENT slug for) its own.
      const raw = this.projects.get(id)
      const latest = isStoredProject(raw) && raw.id === id ? raw : value
      if (latest.revision !== undefined && isNonEmptySlug(latest.slug)) {
        return clone({
          ...latest,
          revision: latest.revision,
          slug: latest.slug.trim().toLowerCase(),
        })
      }
      const needsSlug = !isNonEmptySlug(latest.slug)
      const normalized = {
        ...latest,
        revision: latest.revision ?? 1,
        ...(needsSlug
          ? { slug: this.mintUniqueSlug(latest.name, latest.id) }
          : { slug: latest.slug!.trim().toLowerCase() }),
      }
      this.projects.set(normalized.id, clone(normalized))
      return clone(normalized)
    })
  }

  /** Kebab-case of `name`, uniquified with a short base36 suffix only on
   *  collision. `excludeId` skips the record being normalized itself, so a
   *  re-normalize of the SAME record (e.g. a bare revision backfill on a
   *  record that already has this exact slug) never collides with itself.
   *  The taken set includes every OTHER record's id as well as its slug —
   *  the other half of the id/slug collision guard (assertIdDoesNotAliasSlug
   *  above is the create-time half) — so a freshly minted slug can never
   *  shadow an existing record's id either. */
  private mintUniqueSlug(name: string, excludeId: string): string {
    const base = kebabCase(name) || "project"
    const taken = new Set<string>()
    for (const { key, value } of this.projects.entries()) {
      if (key === excludeId) continue
      taken.add(key)
      if (isStoredProject(value) && isNonEmptySlug(value.slug)) {
        taken.add(value.slug)
      }
    }
    if (!taken.has(base)) return base
    for (let attempt = 0; attempt < MAX_SLUG_MINT_ATTEMPTS; attempt += 1) {
      const candidate = `${base}-${randomSlugSuffix()}`
      if (!taken.has(candidate)) return candidate
    }
    throw new Error(
      `Could not mint a unique slug for project ${excludeId} after ${MAX_SLUG_MINT_ATTEMPTS} attempts.`,
    )
  }
}

// Reentrancy guard for withRegistryRecordLock (finding 2, 2026-07-23,
// Annika): a locked backfill read (readNormalized()) can now be called from
// INSIDE an already-locked upsert() for the same id (upsert reads the
// current record before writing). The file lock below isn't reentrant —
// openSync(path, "wx") fails on a lock file this same call already created
// — so a naive nested acquire would self-deadlock, spinning until
// LOCK_TIMEOUT_MS and throwing. JS is single-threaded, so nothing else can
// interleave between an outer lock's acquisition and a nested call within
// the same synchronous stack; it's safe to skip re-acquiring the file lock
// in that case; the outer acquisition already excludes every OTHER process.
const heldLockKeys = new Set<string>()

export function withRegistryRecordLock<T>(
  lockDirectory: string | undefined,
  id: string,
  operation: () => T,
): T {
  if (lockDirectory === undefined) return operation()

  const lockKey = `${lockDirectory} ${id}`
  if (heldLockKeys.has(lockKey)) return operation()

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

    heldLockKeys.add(lockKey)
    try {
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
        "utf8",
      )
      return operation()
    } finally {
      heldLockKeys.delete(lockKey)
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
    (value.slug === undefined || typeof value.slug === "string") &&
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
  "slug",
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

// Exported so workspace-registry.ts reuses the exact same slug primitives
// rather than a parallel copy (container slugs — both registries share one
// mint/format contract, just different collision domains).
export function isNonEmptySlug(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function kebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function randomSlugSuffix(length = 4): string {
  let suffix = ""
  for (let i = 0; i < length; i += 1) {
    suffix +=
      SLUG_SUFFIX_ALPHABET[Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)]
  }
  return suffix
}
