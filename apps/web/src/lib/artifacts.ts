import { useQuery } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

/**
 * The browser-facing read model for the existing Gonk artifact manifest.
 *
 * This deliberately does not introduce an artifact index: each query is a
 * server-side, session-authorized proxy to the same `/artifacts` and `/img`
 * endpoints used by the Evidence Room and chat attachments. That keeps the
 * artifact surface honest about the scopes the product can currently authorize.
 */
export interface ArtifactRecord {
  readonly id: string
  readonly filename: string
  readonly mediaType: string
  readonly size: number
  readonly createdAt: string
}

export type ArtifactPreview =
  | {
      readonly kind: "text"
      readonly mediaType: string
      readonly content: string
      readonly truncated: boolean
    }
  | { readonly kind: "image"; readonly mediaType: string }
  | { readonly kind: "binary"; readonly mediaType: string }

export const artifactKeys = {
  all: () => ["artifacts"] as const,
  scope: (scope: string) => [...artifactKeys.all(), "scope", scope] as const,
  preview: (scope: string, id: string) =>
    [...artifactKeys.all(), "preview", scope, id] as const,
}

export function artifactUrl(id: string, scope: string): string {
  return `/img?key=${encodeURIComponent(id)}&scope=${encodeURIComponent(scope)}`
}

const listArtifactsFn = createServerFn({ method: "GET" })
  .validator((scope: string) => scope)
  .handler(async ({ data: scope }): Promise<ArtifactRecord[]> => {
    const { listArtifactsFromRequest } = await import("./artifacts.server")
    return listArtifactsFromRequest(scope)
  })

const readArtifactPreviewFn = createServerFn({ method: "GET" })
  .validator((data: { id: string; scope: string }) => data)
  .handler(async ({ data }): Promise<ArtifactPreview> => {
    const { readArtifactPreviewFromRequest } =
      await import("./artifacts.server")
    return readArtifactPreviewFromRequest(data)
  })

export function useArtifacts(scope: string | null) {
  return useQuery({
    queryKey: artifactKeys.scope(scope ?? "none"),
    queryFn: () => listArtifactsFn({ data: scope ?? "" }),
    enabled: Boolean(scope),
  })
}

export function useArtifactPreview(scope: string | null, id: string | null) {
  return useQuery({
    queryKey: artifactKeys.preview(scope ?? "none", id ?? "none"),
    queryFn: () =>
      readArtifactPreviewFn({ data: { scope: scope ?? "", id: id ?? "" } }),
    enabled: Boolean(scope && id),
  })
}
