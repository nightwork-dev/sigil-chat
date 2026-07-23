import type { SigilAuthSession } from "./auth/server"
import { requireSession } from "./auth/session"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import {
  getWebArtifactStore,
  type WebArtifactStoreDependencies,
} from "./artifact-repository.server"

const SAFE_INLINE_ARTIFACT_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export interface ArtifactImageDependencies {
  getSession: (headers: Headers) => Promise<SigilAuthSession | null>
  ownedThreadHomeScope: (userId: string, threadId: string) => string | undefined
  store?: WebArtifactStoreDependencies["store"]
}

export async function readArtifactImage(
  request: Request,
  dependencies: ArtifactImageDependencies,
): Promise<Response> {
  const session = await dependencies.getSession(request.headers)
  try {
    requireSession(session)
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? (error as { status: number }).status
        : 401
    return new Response(null, { status })
  }

  const url = new URL(request.url)
  const key = url.searchParams.get("key") ?? ""
  const scope = url.searchParams.get("scope") ?? ""
  if (!key || key.includes("..")) return new Response(null, { status: 404 })
  try {
    assertAuthorizedScope(
      scope,
      session.user.id,
      dependencies.ownedThreadHomeScope,
    )
  } catch {
    return new Response(null, { status: 404 })
  }

  const store = dependencies.store ?? getWebArtifactStore()
  const content = await store
    .readContent(key, scope, { id: session.user.id })
    .catch(() => undefined)
  if (!content) return new Response(null, { status: 404 })

  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": SAFE_INLINE_ARTIFACT_MEDIA_TYPES.has(
      content.mediaType.toLowerCase(),
    )
      ? "inline"
      : "attachment",
    "content-type": content.mediaType,
    "content-length": String(content.bytes.byteLength),
    "x-content-type-options": "nosniff",
  })
  const body = new ArrayBuffer(content.bytes.byteLength)
  new Uint8Array(body).set(content.bytes)
  return new Response(body, { headers, status: 200 })
}

export async function readArtifactImageFromRequest(
  request: Request,
): Promise<Response> {
  const [{ getSession }, { agentThreadRepository }] = await Promise.all([
    import("./auth/session"),
    import("./agent-threads.server"),
  ])
  return readArtifactImage(request, {
    getSession,
    ownedThreadHomeScope: (userId, threadId) =>
      agentThreadRepository.get(userId, threadId)?.executionBinding
        ?.homeScopeId,
  })
}
