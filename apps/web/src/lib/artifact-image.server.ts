import type { SigilAuthSession } from "./auth/server"
import { requireSession } from "./auth/session"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"

interface ArtifactImageEnvironment {
  apiKey?: string
  gonkMcpUrl: string
}

export interface ArtifactImageDependencies {
  fetcher: typeof fetch
  getSession: (headers: Headers) => Promise<SigilAuthSession | null>
  ownsThread: (userId: string, threadId: string) => boolean
  readEnvironment: () => ArtifactImageEnvironment
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
    assertAuthorizedScope(scope, session.user.id, dependencies.ownsThread)
  } catch {
    return new Response(null, { status: 404 })
  }

  const { apiKey, gonkMcpUrl } = dependencies.readEnvironment()
  if (!apiKey) return new Response(null, { status: 503 })
  const response = await dependencies.fetcher(
    `${new URL(gonkMcpUrl).origin}/img/${key}`,
    {
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-sigil-scope": scope,
      },
    },
  )
  if (!response.ok || !response.body) {
    return new Response(null, { status: response.status })
  }
  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "content-type":
      response.headers.get("content-type") ?? "application/octet-stream",
  })
  const contentLength = response.headers.get("content-length")
  if (contentLength) headers.set("content-length", contentLength)
  return new Response(response.body, { headers, status: response.status })
}

export async function readArtifactImageFromRequest(
  request: Request,
): Promise<Response> {
  const [environment, { getSession }, { agentThreadRepository }] =
    await Promise.all([
      import("@workspace/runtime-env/server"),
      import("./auth/session"),
      import("./agent-threads.server"),
    ])
  return readArtifactImage(request, {
    fetcher: fetch,
    getSession,
    ownsThread: (userId, threadId) =>
      Boolean(agentThreadRepository.get(userId, threadId)),
    readEnvironment: () => environment.readGonkClientEnvironment(process.env),
  })
}
