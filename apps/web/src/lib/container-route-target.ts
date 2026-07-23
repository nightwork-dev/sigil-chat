// Container slugs (SC.10) — the route-boundary resolver for project/workspace
// URL segments. A segment is either the canonical slug (the common case) or
// a legacy/UUID id; resolveProjectRouteParam/resolveWorkspaceRouteParam
// resolve either against the already-fetched nav summary and return the
// canonical {id, slug} pair. CRITICAL BOUNDARY: every scope-keyed query
// (scopeHomeAccessQueryOptions, scopeWorkQueryOptions, artifactScopeForHome,
// homeSignalsQueryOptions, and anything reaching the agent's
// scope-authorization surface) must be built from the returned `.id`, NEVER
// from the raw route param — the slug is a display/routing alias only, it is
// never a scope key.

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

export interface ResolvedProject {
  readonly id: string
  readonly slug: string
}

export interface ResolvedWorkspace {
  readonly id: string
  readonly slug: string
}

// Authz finding (2026-07-23, Annika): a first-match `id === candidate ||
// slug === candidate` over one list is spoofable. A caller-supplied `id` is
// unconstrained (minLength:1 only) and shares one namespace with minted
// slugs; if a crafted record's `id` equals a victim's `slug`, first-match
// returns whichever record happens to come first, silently shadowing the
// victim's URL. The registry now rejects that id at create time
// (project-registry.ts/workspace-registry.ts `upsert()`), so this state
// shouldn't arise going forward — but the resolver is the last line of
// defense against any OTHER path that could still produce it (legacy data,
// a bug elsewhere), so it does its own check rather than trusting the
// registry alone. A candidate that matches one record by id AND a
// DIFFERENT record by slug is ambiguous — treated as unresolved, never
// first-match.
function resolveByIdOrSlug<T extends { id: string; slug: string }>(
  records: readonly T[],
  candidate: string,
): T | undefined {
  const byId = records.find((r) => r.id === candidate)
  const bySlug = records.find((r) => r.slug === candidate)
  if (byId && bySlug && byId.id !== bySlug.id) return undefined
  return byId ?? bySlug
}

export function resolveProjectRouteParam(
  nav: ProjectWorkspaceNavSummary | undefined,
  candidate: string,
): ResolvedProject | undefined {
  if (!nav) return undefined
  return resolveByIdOrSlug(nav.projects, candidate)
}

export function resolveWorkspaceRouteParam(
  nav: ProjectWorkspaceNavSummary | undefined,
  candidate: string,
): ResolvedWorkspace | undefined {
  if (!nav) return undefined
  return resolveByIdOrSlug(nav.workspaces, candidate)
}
