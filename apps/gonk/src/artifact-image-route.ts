import type { SessionArtifactStore } from "./artifact-store.js"
import { normalizeScopeHeaders } from "./artifact-scope.js"

export interface ArtifactImageRouteRequest {
  readonly apiKey: string
  readonly authorization: string | undefined
  readonly id: string
  readonly scopeHeader: string | undefined
  readonly store: SessionArtifactStore
}

export async function handleArtifactImageRoute(
  request: ArtifactImageRouteRequest,
): Promise<
  | { status: 200; bytes: Uint8Array; mediaType: string }
  | { status: 400 | 401 | 404 }
> {
  if (request.authorization !== `Bearer ${request.apiKey}`) {
    return { status: 401 }
  }
  let scope
  try {
    scope = normalizeScopeHeaders(request.scopeHeader, undefined)
  } catch {
    return { status: 400 }
  }
  if (!scope) return { status: 400 }
  try {
    const content = await request.store.readContent(request.id, scope)
    return {
      bytes: content.bytes,
      mediaType: content.mediaType,
      status: 200,
    }
  } catch {
    return { status: 404 }
  }
}
