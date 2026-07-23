import type { SigilAuthSession } from "./auth/server"
import type { ArtifactPreview, ArtifactRecord } from "./artifacts"
import {
  authorizeArtifactScope,
  type WebArtifactStoreDependencies,
} from "./artifact-repository.server"

const MAX_PREVIEW_BYTES = 80_000

export interface ArtifactAccessDependencies
  extends WebArtifactStoreDependencies {
  readonly getSession: () => Promise<SigilAuthSession | null>
  readonly ownedThreadHomeScope: (
    userId: string,
    threadId: string,
  ) => string | undefined
}

export async function listArtifacts(
  scope: string,
  dependencies: ArtifactAccessDependencies,
): Promise<ArtifactRecord[]> {
  const { store, principal } = await authorizeArtifactScope(
    scope,
    dependencies,
  )
  const artifacts = await store.listByScope(scope, principal)
  return artifacts.map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    mediaType: artifact.mediaType,
    size: artifact.size,
    createdAt: artifact.createdAt,
  }))
}

export async function readArtifactPreview(
  input: { id: string; scope: string },
  dependencies: ArtifactAccessDependencies,
): Promise<ArtifactPreview> {
  const { store, principal } = await authorizeArtifactScope(
    input.scope,
    dependencies,
  )
  const content = await store.readContent(input.id, input.scope, principal)
  const mediaType = content.mediaType.toLowerCase()
  if (mediaType.startsWith("image/")) return { kind: "image", mediaType }
  if (!isTextualMediaType(mediaType)) return { kind: "binary", mediaType }

  const bytes = content.bytes
  const truncated = bytes.byteLength > MAX_PREVIEW_BYTES
  return {
    kind: "text",
    mediaType,
    content: new TextDecoder("utf-8", { fatal: false }).decode(
      truncated ? bytes.slice(0, MAX_PREVIEW_BYTES) : bytes,
    ),
    truncated,
  }
}

export async function listArtifactsFromRequest(
  scope: string,
): Promise<ArtifactRecord[]> {
  return listArtifacts(scope, await artifactAccessDependencies())
}

export async function readArtifactPreviewFromRequest(input: {
  id: string
  scope: string
}): Promise<ArtifactPreview> {
  return readArtifactPreview(input, await artifactAccessDependencies())
}

async function artifactAccessDependencies(): Promise<ArtifactAccessDependencies> {
  const [{ getSession }, { agentThreadRepository }] = await Promise.all([
    import("./auth/session"),
    import("./agent-threads.server"),
  ])
  return {
    getSession,
    ownedThreadHomeScope: (userId, threadId) =>
      agentThreadRepository.get(userId, threadId)?.executionBinding?.homeScopeId,
  }
}

function isTextualMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") ||
    mediaType.endsWith("+json") ||
    mediaType.endsWith("+xml") ||
    new Set([
      "application/json",
      "application/xml",
      "application/yaml",
      "application/x-yaml",
      "application/toml",
      "application/x-ndjson",
      "application/csv",
      "application/markdown",
      "application/javascript",
      "application/typescript",
      "application/vnd.sigil.distill+json",
    ]).has(mediaType)
  )
}
