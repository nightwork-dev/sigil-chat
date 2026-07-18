import { createHash } from "node:crypto"
import { resolve } from "node:path"

import {
  ObjectAlreadyExistsError,
  type ObjectStore,
} from "@mirk/artifact"
import { FileObjectStore } from "@mirk/artifact/fs"
import type { AuthenticatedPrincipal } from "@gonk/auth"

import {
  formatScopeHeader,
  normalizeScope,
  type ResourceScope,
  type ScopeInput,
} from "./artifact-scope.js"

// Durable object store for generated/attached image bytes, backed by
// @mirk/artifact's filesystem ObjectStore. The gonk process both WRITES (the
// sigil-generate-image tool) and SERVES (server.ts /img route) through this one
// instance, so there is no cross-process coordination — just a shared directory.
//
// Interim home: staged from Verdaccio until @mirk/artifact publishes to public
// npm; the store swaps to a Surreal-backed ObjectStore later behind the same
// port with no change here.
const root = process.env.SIGIL_ARTIFACT_DIR ?? resolve(".data/artifacts")
const store = new FileObjectStore({ root })

export function getArtifactStore(): FileObjectStore {
  return store
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/** Content-addressed key: identical bytes → identical key → free dedup, and the
 *  served URL is immutable (safe to cache forever). */
export function imageKeyFor(bytes: Uint8Array, mediaType: string): string {
  const digest = createHash("sha256").update(bytes).digest("hex")
  const ext = EXT_BY_MIME[mediaType] ?? "bin"
  return `images/${digest}.${ext}`
}

/** Same-origin path the browser fetches the image from. The web app proxies
 *  `/img/**` to gonk (apps/web/vite.config.ts), so the browser only ever talks
 *  to its own origin — no cross-origin request, no CORS. Set GONK_PUBLIC_URL to
 *  force an absolute URL for a deployment that doesn't front gonk with the web
 *  app's proxy. */
export function imagePublicUrl(key: string): string {
  const base = process.env.GONK_PUBLIC_URL
  return base ? `${base.replace(/\/$/, "")}/img/${key}` : `/img/${key}`
}

/** Same served URL scheme as {@link imagePublicUrl}, named for the general
 *  case: /upload stores arbitrary attachments (not only generated images)
 *  under the same object store, served back through the same /img/ route. */
export const artifactPublicUrl = imagePublicUrl

/** Content-addressed key for an arbitrary uploaded attachment (image or
 *  otherwise) — same dedup property as {@link imageKeyFor}, but not limited
 *  to the known image media types: falls back to the original filename's
 *  extension, then to a generic binary extension. */
export function uploadKeyFor(
  bytes: Uint8Array,
  mediaType: string,
  filename?: string,
): string {
  const digest = createHash("sha256").update(bytes).digest("hex")
  const ext = EXT_BY_MIME[mediaType] ?? extensionFromFilename(filename) ?? "bin"
  return `uploads/${digest}.${ext}`
}

export interface SessionArtifactMetadata {
  readonly id: string
  readonly filename: string
  readonly mediaType: string
  readonly size: number
  readonly createdAt: string
  readonly scope: ResourceScope
}

export interface SessionArtifactContent {
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export interface PutSessionArtifactInput {
  readonly bytes: Uint8Array
  readonly filename?: string
  readonly mediaType: string
  /** Accepts the old bare session id as well as a tiered scope. */
  readonly scope: ScopeInput
}

export type ScopePrincipal = AuthenticatedPrincipal | undefined

/**
 * Authorization is deliberately a separate seam from scope normalization.
 * Tier + id says where an artifact lives; it never says who may touch it.
 * Auth work supplies the real membership policy here. v1 preserves today's
 * behavior by allowing every authenticated/legacy caller.
 */
export type CanAccessScope = (
  principal: ScopePrincipal,
  scope: ResourceScope,
) => boolean | Promise<boolean>

export function canAccessScope(
  _principal: ScopePrincipal,
  _scope: ResourceScope,
): boolean {
  return true
}

export interface SessionArtifactStoreOptions {
  readonly canAccessScope?: CanAccessScope
}

/**
 * Resource metadata is persisted beside content-addressed bytes in the same
 * @mirk/artifact FileObjectStore. The manifest makes list-by-scope durable;
 * the byte object remains shared and immutable.
 */
export class SessionArtifactStore {
  private readonly writes = new Map<string, Promise<void>>()
  private readonly canAccessScope: CanAccessScope

  constructor(
    private readonly objects: ObjectStore,
    options: SessionArtifactStoreOptions = {},
  ) {
    this.canAccessScope = options.canAccessScope ?? canAccessScope
  }

  async putFile(
    input: PutSessionArtifactInput,
    principal?: AuthenticatedPrincipal,
  ): Promise<SessionArtifactMetadata> {
    const scope = requireScope(input.scope)
    await this.assertScopeAccess(principal, scope)

    return this.withScopeLock(scope, async () => {
      const id = uploadKeyFor(input.bytes, input.mediaType, input.filename)
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
      }
      const artifacts = await this.listByScope(scope, principal)
      await this.writeManifest(scope, [...artifacts, artifact])
      return artifact
    })
  }

  async listByScope(
    input: ScopeInput,
    principal?: AuthenticatedPrincipal,
  ): Promise<SessionArtifactMetadata[]> {
    const scope = requireScope(input)
    await this.assertScopeAccess(principal, scope)
    const stream = await this.objects.get(manifestKey(scope))
    if (!stream) return []
    const bytes = await collectBytes(stream)
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter(isStoredArtifactMetadata)
        .map((value) => ({
          ...value,
          scope: normalizeScope(value.scope) as ResourceScope,
        }))
    } catch {
      return []
    }
  }

  /** Compatibility name for the session-only store API. */
  async listBySession(
    input: ScopeInput,
    principal?: AuthenticatedPrincipal,
  ): Promise<SessionArtifactMetadata[]> {
    return this.listByScope(input, principal)
  }

  async readContent(
    id: string,
    input: ScopeInput,
    principal?: AuthenticatedPrincipal,
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
    // This is the authz seam. Do not replace it with tier/id heuristics: a
    // project/persona scope's membership policy belongs to the auth layer.
    if (!(await this.canAccessScope(principal, scope))) {
      throw new Error(`Access denied for ${scope.tier} scope: ${scope.id}`)
    }
  }

  private async withScopeLock<T>(
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
}

const sessionArtifactStore = new SessionArtifactStore(store)

export function getSessionArtifactStore(): SessionArtifactStore {
  return sessionArtifactStore
}

function requireScope(input: ScopeInput): ResourceScope {
  const scope = normalizeScope(input)
  if (!scope) throw new Error("Artifact operations require a valid resource scope.")
  return scope
}

function manifestKey(scope: ResourceScope): string {
  const digest = createHash("sha256").update(scope.id).digest("hex")
  const directory = {
    session: "sessions",
    project: "projects",
    persona: "personas",
  }[scope.tier]
  return `${directory}/${digest}/artifacts`
}

function isStoredArtifactMetadata(
  value: unknown,
): value is Omit<SessionArtifactMetadata, "scope"> & {
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
    normalizeScope(record.scope as ScopeInput | undefined) !== undefined
  )
}

async function collectBytes(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
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

function extensionFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return match?.[1]?.toLowerCase()
}
