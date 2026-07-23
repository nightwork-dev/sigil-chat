import type { ResourceScope, ScopeInput } from "./scope"

export interface ArtifactProvenance {
  readonly kind: "image-edit"
  readonly sourceArtifactId: string
  readonly instruction: string
  readonly backend: string
}

export interface SessionArtifactMetadata {
  readonly id: string
  readonly filename: string
  readonly mediaType: string
  readonly size: number
  readonly createdAt: string
  readonly scope: ResourceScope
  readonly provenance?: ArtifactProvenance
}

export interface SessionArtifactContent {
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export interface PutSessionArtifactInput {
  readonly bytes: Uint8Array
  readonly filename?: string
  readonly mediaType: string
  /** Accepts the old bare session id as well as a tiered scope. */
  readonly scope: ScopeInput
  readonly provenance?: ArtifactProvenance
}

export interface ArtifactPrincipal {
  readonly id?: string
}

export type ScopePrincipal = ArtifactPrincipal | undefined

/**
 * Authorization is deliberately a separate seam from scope normalization.
 * Tier + id says where an artifact lives; it never says who may touch it.
 */
export type CanAccessScope = (
  principal: ScopePrincipal,
  scope: ResourceScope,
) => boolean | Promise<boolean>
