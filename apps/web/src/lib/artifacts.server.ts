import { readGonkClientEnvironment } from "@workspace/runtime-env/server"

import { AGENT_SCOPE_HEADER } from "./agent-session-scope"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import type { SigilAuthSession } from "./auth/server"
import type { ArtifactPreview, ArtifactRecord } from "./artifacts"

const MAX_PREVIEW_BYTES = 80_000

export interface ArtifactAccessDependencies {
  readonly fetcher: typeof fetch
  readonly getSession: () => Promise<SigilAuthSession | null>
  readonly ownedThreadHomeScope: (
    userId: string,
    threadId: string,
  ) => string | undefined
  readonly readEnvironment: () => { apiKey?: string; gonkMcpUrl: string }
}

export async function listArtifacts(
  scope: string,
  dependencies: ArtifactAccessDependencies,
): Promise<ArtifactRecord[]> {
  const { apiKey, artifactsUrl } = await authorizedArtifactRequest(
    scope,
    dependencies,
  )
  const response = await dependencies.fetcher(artifactsUrl, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      [AGENT_SCOPE_HEADER]: scope,
    },
  })
  if (!response.ok) {
    throw new Error(
      `Artifact list failed (${response.status} ${response.statusText})`,
    )
  }
  return (await response.json()) as ArtifactRecord[]
}

export async function readArtifactPreview(
  input: { id: string; scope: string },
  dependencies: ArtifactAccessDependencies,
): Promise<ArtifactPreview> {
  const { apiKey, gonkOrigin } = await authorizedArtifactRequest(
    input.scope,
    dependencies,
  )
  const response = await dependencies.fetcher(
    `${gonkOrigin}/img/${encodeURIComponent(input.id)}`,
    {
      headers: {
        authorization: `Bearer ${apiKey}`,
        [AGENT_SCOPE_HEADER]: input.scope,
      },
    },
  )
  if (!response.ok) {
    throw new Error(
      `Artifact preview failed (${response.status} ${response.statusText})`,
    )
  }

  const mediaType =
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() || "application/octet-stream"
  if (mediaType.startsWith("image/")) return { kind: "image", mediaType }
  if (!isTextualMediaType(mediaType)) return { kind: "binary", mediaType }

  const bytes = new Uint8Array(await response.arrayBuffer())
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

async function authorizedArtifactRequest(
  scope: string,
  dependencies: ArtifactAccessDependencies,
): Promise<{ apiKey: string; artifactsUrl: string; gonkOrigin: string }> {
  const candidate = await dependencies.getSession()
  const { requireSession } = await import("./auth/session")
  const assertSession: (
    value: SigilAuthSession | null,
  ) => asserts value is SigilAuthSession = requireSession
  assertSession(candidate)
  assertAuthorizedScope(
    scope,
    candidate.user.id,
    dependencies.ownedThreadHomeScope,
  )
  const { apiKey, gonkMcpUrl } = dependencies.readEnvironment()
  if (!apiKey)
    throw new Error("GONK_MCP_KEY is not configured for artifact access.")
  return {
    apiKey,
    artifactsUrl: gonkMcpUrl.replace(/\/mcp\/?$/, "/artifacts"),
    gonkOrigin: new URL(gonkMcpUrl).origin,
  }
}

async function artifactAccessDependencies(): Promise<ArtifactAccessDependencies> {
  const [{ getSession }, { agentThreadRepository }] = await Promise.all([
    import("./auth/session"),
    import("./agent-threads.server"),
  ])
  return {
    fetcher: fetch,
    getSession,
    ownedThreadHomeScope: (userId, threadId) =>
      agentThreadRepository.get(userId, threadId)?.executionBinding?.homeScopeId,
    readEnvironment: () => readGonkClientEnvironment(process.env),
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
