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

export function resolveProjectRouteParam(
  nav: ProjectWorkspaceNavSummary | undefined,
  candidate: string,
): ResolvedProject | undefined {
  return nav?.projects.find((p) => p.id === candidate || p.slug === candidate)
}

export function resolveWorkspaceRouteParam(
  nav: ProjectWorkspaceNavSummary | undefined,
  candidate: string,
): ResolvedWorkspace | undefined {
  return nav?.workspaces.find(
    (w) => w.id === candidate || w.slug === candidate,
  )
}
