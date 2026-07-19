// The authenticated artifact-resource API consumed exclusively through the web
// app's server functions (never the browser directly). GET lists a scope's
// durable artifacts with their /img content URLs; DELETE removes an artifact
// from that scope's manifest (the content-addressed blob is shared and stays).
//
// The logic is a pure function over a small request shape so it is unit-testable
// without spinning up the node HTTP server; server.ts is a thin node adapter.

import type { SessionArtifactStore } from "./artifact-store.js"
import { artifactPublicUrl } from "./artifact-store.js"
import {
  normalizeScopeHeaders,
  SIGIL_SCOPE_HEADER,
} from "./artifact-scope.js"

export interface ArtifactRouteRequest {
  readonly method: string
  readonly authorization: string | undefined
  readonly scopeHeader: string | undefined
  readonly legacyScopeHeader: string | undefined
  /** Present for `/artifacts/:id` (DELETE); undefined for the `/artifacts` collection. */
  readonly id: string | undefined
}

export interface ArtifactRouteResult {
  readonly status: number
  readonly json?: unknown
  readonly text?: string
}

export interface ArtifactRouteDeps {
  readonly apiKey: string
  readonly store: SessionArtifactStore
}

/**
 * Handle an `/artifacts` request. Requires the service bearer (same key that
 * gates /mcp and /upload) and the canonical `x-sigil-scope` header. Scope is
 * location only; per-owner authorization is the store's separate `canAccessScope`
 * seam, so this API stays a thin scoped adapter over the durable manifest.
 */
export async function handleArtifactRoute(
  request: ArtifactRouteRequest,
  deps: ArtifactRouteDeps,
): Promise<ArtifactRouteResult> {
  if (request.authorization !== `Bearer ${deps.apiKey}`) {
    return { status: 401, text: "Unauthorized" }
  }

  const scope = normalizeScopeHeaders(
    request.scopeHeader,
    request.legacyScopeHeader,
  )
  if (!scope) {
    return { status: 400, text: `Missing ${SIGIL_SCOPE_HEADER} header` }
  }

  if (request.method === "GET") {
    const artifacts = await deps.store.listByScope(scope)
    return {
      status: 200,
      json: artifacts.map((artifact) => ({
        id: artifact.id,
        filename: artifact.filename,
        mediaType: artifact.mediaType,
        size: artifact.size,
        createdAt: artifact.createdAt,
        url: artifactPublicUrl(artifact.id),
      })),
    }
  }

  if (request.method === "DELETE") {
    if (!request.id) {
      return { status: 400, text: "Missing artifact id" }
    }
    const removed = await deps.store.removeFromScope(request.id, scope)
    return removed
      ? { status: 200, json: { deleted: true, id: request.id } }
      : { status: 404, text: "Artifact not found in scope" }
  }

  return { status: 405, text: "Method not allowed" }
}
