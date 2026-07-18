import { createHash } from "node:crypto"
import { resolve } from "node:path"

import {
  ObjectAlreadyExistsError,
  type ObjectStore,
} from "@mirk/artifact"
import { FileObjectStore } from "@mirk/artifact/fs"

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

/** Absolute URL the browser fetches the image from. gonk serves it at /img/;
 *  the host is env-configurable for deploys, defaulting to the Portless dev URL. */
export function imagePublicUrl(key: string): string {
  const base = process.env.GONK_PUBLIC_URL ?? "http://sigil-chat-gonk.localhost:1355"
  return `${base.replace(/\/$/, "")}/img/${key}`
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
  readonly scope: string
}

export interface SessionArtifactContent {
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export interface PutSessionArtifactInput {
  readonly bytes: Uint8Array
  readonly filename?: string
  readonly mediaType: string
  readonly scope: string
}

/**
 * Session metadata is persisted as an object beside the bytes in the same
 * @mirk/artifact FileObjectStore. The manifest makes list-by-session durable;
 * the content-addressed byte object remains shared and immutable.
 */
export class SessionArtifactStore {
  private readonly writes = new Map<string, Promise<void>>()

  constructor(private readonly objects: ObjectStore) {}

  async putFile(
    input: PutSessionArtifactInput,
  ): Promise<SessionArtifactMetadata> {
    return this.withScopeLock(input.scope, async () => {
      const id = uploadKeyFor(input.bytes, input.mediaType, input.filename)
      const existing = (await this.listBySession(input.scope)).find(
        (artifact) => artifact.id === id,
      )
      if (existing) return existing

      try {
        await this.objects.put(id, input.bytes, {
          mediaType: input.mediaType,
          metadata: {
            filename: input.filename ?? "attachment",
            scope: input.scope,
          },
          ifAbsent: true,
        })
      } catch (error) {
        // Content-addressed bytes may already exist from another session. The
        // session manifest below is still written for this session.
        if (!(error instanceof ObjectAlreadyExistsError)) throw error
      }

      const artifact: SessionArtifactMetadata = {
        id,
        filename: input.filename ?? "attachment",
        mediaType: input.mediaType,
        size: input.bytes.byteLength,
        createdAt: new Date().toISOString(),
        scope: input.scope,
      }
      const artifacts = await this.listBySession(input.scope)
      await this.writeManifest(input.scope, [...artifacts, artifact])
      return artifact
    })
  }

  async listBySession(scope: string): Promise<SessionArtifactMetadata[]> {
    const stream = await this.objects.get(manifestKey(scope))
    if (!stream) return []
    const bytes = await collectBytes(stream)
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isSessionArtifactMetadata)
    } catch {
      return []
    }
  }

  async readContent(id: string): Promise<SessionArtifactContent> {
    const info = await this.objects.head(id)
    const stream = await this.objects.get(id)
    if (!info || !stream) throw new Error(`Artifact not found: ${id}`)
    return {
      bytes: await collectBytes(stream),
      mediaType: info.mediaType ?? "application/octet-stream",
    }
  }

  private async writeManifest(
    scope: string,
    artifacts: readonly SessionArtifactMetadata[],
  ): Promise<void> {
    await this.objects.put(
      manifestKey(scope),
      new TextEncoder().encode(JSON.stringify(artifacts)),
      { mediaType: "application/json" },
    )
  }

  private async withScopeLock<T>(
    scope: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.writes.get(scope) ?? Promise.resolve()
    const current = previous.then(operation)
    const queued = current.then(
      () => undefined,
      () => undefined,
    )
    this.writes.set(scope, queued)
    try {
      return await current
    } finally {
      if (this.writes.get(scope) === queued) this.writes.delete(scope)
    }
  }
}

const sessionArtifactStore = new SessionArtifactStore(store)

export function getSessionArtifactStore(): SessionArtifactStore {
  return sessionArtifactStore
}

function manifestKey(scope: string): string {
  const digest = createHash("sha256").update(scope).digest("hex")
  return `sessions/${digest}/artifacts`
}

function isSessionArtifactMetadata(
  value: unknown,
): value is SessionArtifactMetadata {
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
    typeof record.scope === "string"
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
