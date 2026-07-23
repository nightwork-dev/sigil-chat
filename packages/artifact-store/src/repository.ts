import { createHash, randomUUID } from "node:crypto"
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises"
import { hostname } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { ObjectAlreadyExistsError, type ObjectStore } from "@mirk/artifact"
import { FileObjectStore } from "@mirk/artifact/fs"
import { readDataEnvironment } from "@workspace/runtime-env/server"

import {
  formatScopeHeader,
  normalizeScope,
  type ResourceScope,
  type ScopeInput,
} from "./scope"
import {
  artifactPublicUrl,
  derivedUploadKeyFor,
  uploadKeyFor,
} from "./urls"
import type {
  ArtifactProvenance,
  CanAccessScope,
  PutSessionArtifactInput,
  ScopePrincipal,
  SessionArtifactContent,
  SessionArtifactMetadata,
} from "./types"

export type {
  ArtifactProvenance,
  CanAccessScope,
  PutSessionArtifactInput,
  ScopePrincipal,
  SessionArtifactContent,
  SessionArtifactMetadata,
} from "./types"

export { artifactPublicUrl } from "./urls"

export interface ArtifactRepositoryOptions {
  readonly canAccessScope?: CanAccessScope
  /**
   * Directory used for cross-instance manifest write locks. Pass this when two
   * Node processes share one FileObjectStore root. Without it, writes are still
   * serialized inside this repository instance only.
   */
  readonly lockRoot?: string
  readonly lockPollMs?: number
  readonly lockHeartbeatMs?: number
  readonly lockLeaseMs?: number
  readonly lockTimeoutMs?: number
}

export interface FileArtifactRepositoryOptions
  extends Omit<ArtifactRepositoryOptions, "lockRoot"> {
  readonly root?: string
  readonly lockRoot?: string
}

export function canAccessScope(
  _principal: ScopePrincipal,
  _scope: ResourceScope,
): boolean {
  return true
}

export function createScopeAccessCheck(
  policy: {
    authorize(input: {
      action: "read" | "write"
      principalId: string
      resourceScope: string
    }): boolean
  },
  action: "read" | "write" = "read",
): CanAccessScope {
  return (principal, scope) => {
    const principalId = principalIdentifier(principal)
    return (
      principalId !== undefined &&
      policy.authorize({
        action,
        principalId,
        resourceScope: formatScopeHeader(scope)!,
      })
    )
  }
}

export class ArtifactScopeAccessDeniedError extends Error {
  constructor(readonly scope: ResourceScope) {
    super(`Access denied for ${scope.tier} scope: ${scope.id}`)
    this.name = "ArtifactScopeAccessDeniedError"
  }
}

export class ArtifactScopeLockTimeoutError extends Error {
  constructor(readonly scope: ResourceScope) {
    super(`Timed out waiting for artifact scope lock: ${scope.tier}:${scope.id}`)
    this.name = "ArtifactScopeLockTimeoutError"
  }
}

/**
 * Resource metadata is persisted beside content-addressed bytes in the same
 * @mirk/artifact ObjectStore. The manifest makes list-by-scope durable; the
 * byte object remains shared and immutable.
 */
export class SessionArtifactStore {
  private readonly writes = new Map<string, Promise<void>>()
  private readonly canAccessScope: CanAccessScope
  private readonly lockRoot: string | undefined
  private readonly lockPollMs: number
  private readonly lockHeartbeatMs: number
  private readonly lockLeaseMs: number
  private readonly lockTimeoutMs: number

  constructor(
    private readonly objects: ObjectStore,
    options: ArtifactRepositoryOptions = {},
  ) {
    this.canAccessScope = options.canAccessScope ?? canAccessScope
    this.lockRoot = options.lockRoot
    this.lockPollMs = options.lockPollMs ?? 5
    this.lockHeartbeatMs = options.lockHeartbeatMs ?? 2_000
    this.lockLeaseMs = options.lockLeaseMs ?? 10_000
    this.lockTimeoutMs = options.lockTimeoutMs ?? 15_000
  }

  async putFile(
    input: PutSessionArtifactInput,
    principal?: ScopePrincipal,
  ): Promise<SessionArtifactMetadata> {
    const scope = requireScope(input.scope)
    await this.assertScopeAccess(principal, scope)

    return this.withScopeLock(scope, async () => {
      const id = input.provenance
        ? derivedUploadKeyFor(
            input.bytes,
            input.mediaType,
            input.filename,
            input.provenance,
          )
        : uploadKeyFor(input.bytes, input.mediaType, input.filename)
      const existing = (await this.listByScope(scope, principal)).find(
        (artifact) => artifact.id === id,
      )
      if (existing) return existing

      try {
        await this.objects.put(id, input.bytes, {
          mediaType: input.mediaType,
          metadata: {
            filename: input.filename ?? "attachment",
            scope: formatScopeHeader(scope) ?? scope.id,
          },
          ifAbsent: true,
        })
      } catch (error) {
        // Content-addressed bytes may already exist from another scope. The
        // selected scope manifest below is still written for this scope.
        if (!(error instanceof ObjectAlreadyExistsError)) throw error
      }

      const artifact: SessionArtifactMetadata = {
        id,
        filename: input.filename ?? "attachment",
        mediaType: input.mediaType,
        size: input.bytes.byteLength,
        createdAt: new Date().toISOString(),
        scope,
        ...(input.provenance ? { provenance: input.provenance } : {}),
      }
      const artifacts = await this.listByScope(scope, principal)
      await this.writeManifest(scope, [...artifacts, artifact])
      return artifact
    })
  }

  async listByScope(
    input: ScopeInput,
    principal?: ScopePrincipal,
  ): Promise<SessionArtifactMetadata[]> {
    const scope = requireScope(input)
    await this.assertScopeAccess(principal, scope)
    const stream = await this.objects.get(manifestKey(scope))
    if (!stream) return []
    const bytes = await collectBytes(stream)
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isStoredArtifactMetadata).map((value) => ({
        ...value,
        scope: normalizeScope(value.scope) as ResourceScope,
      }))
    } catch {
      return []
    }
  }

  async readContent(
    id: string,
    input: ScopeInput,
    principal?: ScopePrincipal,
  ): Promise<SessionArtifactContent> {
    const scope = requireScope(input)
    const artifact = (await this.listByScope(scope, principal)).find(
      (candidate) => candidate.id === id,
    )
    if (!artifact) throw new Error(`Artifact not found in scope: ${id}`)

    const info = await this.objects.head(id)
    const stream = await this.objects.get(id)
    if (!info || !stream) throw new Error(`Artifact not found: ${id}`)
    return {
      bytes: await collectBytes(stream),
      mediaType: info.mediaType ?? artifact.mediaType,
    }
  }

  async removeFromScope(
    id: string,
    input: ScopeInput,
    principal?: ScopePrincipal,
  ): Promise<boolean> {
    const scope = requireScope(input)
    await this.assertScopeAccess(principal, scope)

    return this.withScopeLock(scope, async () => {
      const artifacts = await this.listByScope(scope, principal)
      const next = artifacts.filter((artifact) => artifact.id !== id)
      if (next.length === artifacts.length) return false
      await this.writeManifest(scope, next)
      return true
    })
  }

  private async writeManifest(
    scope: ResourceScope,
    artifacts: readonly SessionArtifactMetadata[],
  ): Promise<void> {
    await this.objects.put(
      manifestKey(scope),
      new TextEncoder().encode(JSON.stringify(artifacts)),
      { mediaType: "application/json" },
    )
  }

  private async assertScopeAccess(
    principal: ScopePrincipal,
    scope: ResourceScope,
  ): Promise<void> {
    if (!(await this.canAccessScope(principal, scope))) {
      throw new ArtifactScopeAccessDeniedError(scope)
    }
  }

  private async withScopeLock<T>(
    scope: ResourceScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.withLocalScopeLock(scope, () =>
      this.withFilesystemScopeLock(scope, operation),
    )
  }

  private async withLocalScopeLock<T>(
    scope: ResourceScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${scope.tier}:${scope.id}`
    const previous = this.writes.get(key) ?? Promise.resolve()
    const current = previous.then(operation)
    const queued = current.then(
      () => undefined,
      () => undefined,
    )
    this.writes.set(key, queued)
    try {
      return await current
    } finally {
      if (this.writes.get(key) === queued) this.writes.delete(key)
    }
  }

  private async withFilesystemScopeLock<T>(
    scope: ResourceScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!this.lockRoot) return operation()
    const lockPath = join(this.lockRoot, `${scopeLockName(scope)}.lock`)
    const lease = await acquireDirectoryLock(lockPath, scope, {
      heartbeatMs: this.lockHeartbeatMs,
      leaseMs: this.lockLeaseMs,
      pollMs: this.lockPollMs,
      timeoutMs: this.lockTimeoutMs,
    })
    try {
      return await operation()
    } finally {
      await lease.release()
    }
  }
}

export function createFileSessionArtifactStore(
  options: FileArtifactRepositoryOptions = {},
): SessionArtifactStore {
  const root =
    options.root ??
    process.env.SIGIL_ARTIFACT_DIR ??
    readDataEnvironment(process.env).artifactDir
  return new SessionArtifactStore(new FileObjectStore({ root }), {
    ...options,
    lockRoot: options.lockRoot ?? join(root, ".locks"),
  })
}

export const getArtifactStore = createFileObjectStore

export function createFileObjectStore(root?: string): FileObjectStore {
  return new FileObjectStore({
    root:
      root ??
      process.env.SIGIL_ARTIFACT_DIR ??
      readDataEnvironment(process.env).artifactDir,
  })
}

let sessionArtifactStore: SessionArtifactStore | undefined

export function getSessionArtifactStore(): SessionArtifactStore {
  sessionArtifactStore ??= createFileSessionArtifactStore()
  return sessionArtifactStore
}

export function artifactRecordForClient(
  artifact: SessionArtifactMetadata,
): SessionArtifactMetadata & { url: string } {
  return {
    ...artifact,
    url: artifactPublicUrl(artifact.id, artifact.scope),
  }
}

function requireScope(input: ScopeInput): ResourceScope {
  const scope = normalizeScope(input)
  if (!scope)
    throw new Error("Artifact operations require a valid resource scope.")
  return scope
}

function manifestKey(scope: ResourceScope): string {
  const digest = createHash("sha256").update(scope.id).digest("hex")
  const directory = {
    session: "sessions",
    workspace: "workspaces",
    project: "projects",
    persona: "personas",
  }[scope.tier]
  return `${directory}/${digest}/artifacts`
}

function scopeLockName(scope: ResourceScope): string {
  return createHash("sha256")
    .update(`${scope.tier}:${scope.id}`)
    .digest("hex")
}

async function acquireDirectoryLock(
  lockPath: string,
  scope: ResourceScope,
  options: {
    heartbeatMs: number
    leaseMs: number
    pollMs: number
    timeoutMs: number
  },
): Promise<DirectoryLockLease> {
  await mkdir(dirname(lockPath), { recursive: true })
  const startedAt = Date.now()
  while (true) {
    const token = randomUUID()
    const ownerName = `owner-${token}.json`
    const ownerPath = join(lockPath, ownerName)
    try {
      await mkdir(lockPath)
      try {
        await writeFile(
          ownerPath,
          JSON.stringify({
            acquiredAt: new Date().toISOString(),
            hostname: hostname(),
            pid: process.pid,
            token,
          } satisfies DirectoryLockOwner),
          { flag: "wx" },
        )
      } catch (error) {
        await rm(lockPath, { force: true, recursive: true })
        throw error
      }
      return createDirectoryLockLease(lockPath, ownerPath, options.heartbeatMs)
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error
      if (await recoverStaleDirectoryLock(lockPath, options.leaseMs)) continue
      if (Date.now() - startedAt > options.timeoutMs) {
        throw new ArtifactScopeLockTimeoutError(scope)
      }
      await delay(options.pollMs)
    }
  }
}

interface DirectoryLockOwner {
  readonly acquiredAt: string
  readonly hostname: string
  readonly pid: number
  readonly token: string
}

interface DirectoryLockLease {
  release(): Promise<void>
}

function createDirectoryLockLease(
  lockPath: string,
  ownerPath: string,
  heartbeatMs: number,
): DirectoryLockLease {
  const heartbeat = setInterval(() => {
    const now = new Date()
    void utimes(ownerPath, now, now).catch(() => undefined)
  }, heartbeatMs)
  heartbeat.unref()

  return {
    async release() {
      clearInterval(heartbeat)
      try {
        await stat(ownerPath)
      } catch {
        return
      }
      const releasedPath = `${lockPath}.released-${randomUUID()}`
      try {
        await rename(lockPath, releasedPath)
      } catch (error) {
        if (isMissingError(error)) return
        throw error
      }
      await rm(releasedPath, { force: true, recursive: true })
    },
  }
}

async function recoverStaleDirectoryLock(
  lockPath: string,
  leaseMs: number,
): Promise<boolean> {
  if (!(await directoryLockIsStale(lockPath, leaseMs))) return false
  const recoveryPath = `${lockPath}.stale-${randomUUID()}`
  try {
    await rename(lockPath, recoveryPath)
  } catch (error) {
    if (isMissingError(error)) return true
    throw error
  }
  await rm(recoveryPath, { force: true, recursive: true })
  return true
}

async function directoryLockIsStale(
  lockPath: string,
  leaseMs: number,
): Promise<boolean> {
  let ownerPath: string | undefined
  try {
    const ownerName = (await readdir(lockPath)).find(
      (name) => name.startsWith("owner-") && name.endsWith(".json"),
    )
    if (ownerName) ownerPath = join(lockPath, ownerName)
  } catch (error) {
    if (isMissingError(error)) return true
    throw error
  }

  if (!ownerPath) {
    return pathLeaseExpired(lockPath, leaseMs)
  }

  try {
    const owner = parseDirectoryLockOwner(await readFile(ownerPath, "utf8"))
    if (owner?.hostname === hostname() && !processIsAlive(owner.pid)) {
      return true
    }
  } catch (error) {
    if (!isMissingError(error)) {
      return pathLeaseExpired(ownerPath, leaseMs)
    }
  }
  return pathLeaseExpired(ownerPath, leaseMs)
}

async function pathLeaseExpired(path: string, leaseMs: number) {
  try {
    const metadata = await stat(path)
    return metadata.mtimeMs + leaseMs <= Date.now()
  } catch (error) {
    if (isMissingError(error)) return true
    throw error
  }
}

function parseDirectoryLockOwner(value: string): DirectoryLockOwner | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined
    }
    const owner = parsed as Record<string, unknown>
    return typeof owner.acquiredAt === "string" &&
      typeof owner.hostname === "string" &&
      Number.isSafeInteger(owner.pid) &&
      typeof owner.token === "string"
      ? (owner as unknown as DirectoryLockOwner)
      : undefined
  } catch {
    return undefined
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH"
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "EEXIST"
  )
}

function isMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}

function isStoredArtifactMetadata(value: unknown): value is Omit<
  SessionArtifactMetadata,
  "scope"
> & {
  scope: ScopeInput
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.filename === "string" &&
    typeof record.mediaType === "string" &&
    typeof record.size === "number" &&
    typeof record.createdAt === "string" &&
    (record.provenance === undefined ||
      isArtifactProvenance(record.provenance)) &&
    normalizeScope(record.scope as ScopeInput | undefined) !== undefined
  )
}

function isArtifactProvenance(value: unknown): value is ArtifactProvenance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.kind === "image-edit" &&
    typeof record.sourceArtifactId === "string" &&
    record.sourceArtifactId.length > 0 &&
    typeof record.instruction === "string" &&
    record.instruction.length > 0 &&
    typeof record.backend === "string" &&
    record.backend.length > 0
  )
}

async function collectBytes(
  stream: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of stream) {
    const copy = new Uint8Array(chunk)
    chunks.push(copy)
    size += copy.byteLength
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function principalIdentifier(principal: ScopePrincipal): string | undefined {
  if (typeof principal !== "object" || principal === null) return undefined
  const id = principal.id
  return typeof id === "string" && id.length > 0 ? id : undefined
}
