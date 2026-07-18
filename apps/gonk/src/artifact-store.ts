import { createHash } from "node:crypto"
import { resolve } from "node:path"

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
