import { createHash } from "node:crypto"

import { formatScopeHeader, type ScopeInput } from "./scope"
import type { ArtifactProvenance } from "./types"

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/** Content-addressed key: identical bytes → identical key → free dedup. */
export function imageKeyFor(bytes: Uint8Array, mediaType: string): string {
  const digest = createHash("sha256").update(bytes).digest("hex")
  const ext = EXT_BY_MIME[mediaType] ?? "bin"
  return `images/${digest}.${ext}`
}

/** Same-origin path the browser fetches through the authenticated web route. */
export function imagePublicUrl(key: string, scope: ScopeInput): string {
  const scopeHeader = formatScopeHeader(scope)
  if (!scopeHeader) throw new Error("Artifact URL requires a valid scope")
  return `/api/media/artifact?key=${encodeURIComponent(key)}&scope=${encodeURIComponent(scopeHeader)}`
}

/** Same served URL scheme as {@link imagePublicUrl}, named for uploads. */
export const artifactPublicUrl = imagePublicUrl

export function uploadKeyFor(
  bytes: Uint8Array,
  mediaType: string,
  filename?: string,
): string {
  const digest = createHash("sha256").update(bytes).digest("hex")
  const ext = EXT_BY_MIME[mediaType] ?? extensionFromFilename(filename) ?? "bin"
  return `uploads/${digest}.${ext}`
}

export function derivedUploadKeyFor(
  bytes: Uint8Array,
  mediaType: string,
  filename: string | undefined,
  provenance: ArtifactProvenance,
): string {
  const contentDigest = createHash("sha256").update(bytes).digest("hex")
  const derivationDigest = createHash("sha256")
    .update(
      JSON.stringify({
        backend: provenance.backend,
        instruction: provenance.instruction,
        kind: provenance.kind,
        sourceArtifactId: provenance.sourceArtifactId,
      }),
    )
    .digest("hex")
  const ext = EXT_BY_MIME[mediaType] ?? extensionFromFilename(filename) ?? "bin"
  return `uploads/${contentDigest}-derived-${derivationDigest}.${ext}`
}

function extensionFromFilename(
  filename: string | undefined,
): string | undefined {
  if (!filename) return undefined
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return match?.[1]?.toLowerCase()
}
