---
name: route-identity-discipline
description: Use when a route param resolves a project/workspace/session and the resolved value feeds a scope-keyed query, an authorization check, or an outbound URL. Covers the slug-vs-id rule — which one is a display alias and which one is the authorization key.
---

# Route identity discipline

`container-route-target.ts` and `session-route-target.ts` resolve URL
segments (project/workspace slugs, session slugs) against already-fetched
nav summaries. The rule they both enforce is an authorization rule, not a
routing convenience: **a slug is a display/routing alias only — it is never
a scope key.**

## Every scope-keyed query is built from `.id`, never the raw route param

`resolveProjectRouteParam`/`resolveWorkspaceRouteParam` return `{ id, slug }`
pairs. The file header states the boundary explicitly:

> CRITICAL BOUNDARY: every scope-keyed query (`scopeHomeAccessQueryOptions`,
> `scopeWorkQueryOptions`, `artifactScopeForHome`, `homeSignalsQueryOptions`,
> and anything reaching the agent's scope-authorization surface) must be
> built from the returned `.id`, NEVER from the raw route param.

The raw candidate from the URL is untrusted input with an unconstrained
shape (`minLength: 1` only) sharing a namespace with minted slugs. Once
resolved against the nav summary, `.id` is the authorization key and `.slug`
is what you're allowed to put back in a URL or breadcrumb.

## Session URLs emit only `.slug`, never `.id`

`session-route-target.ts` is the inverse direction — building a redirect
target from an already-resolved thread. Its header states the same rule
from the output side: `chatResolverRedirectTarget` only ever emits a
thread's `.slug` into a URL. If you're building a new redirect or deep link
for a session, thread, project, or workspace, the outbound URL param is the
slug; the id stays server-side/query-side.

## Ambiguous resolution is refused, not first-matched

`resolveByIdOrSlug` does not do a first-match `id === candidate || slug ===
candidate` scan. It checks both independently and, when a candidate matches
one record by id **and** a different record by slug, returns `undefined`
rather than picking whichever came first in the list:

```ts
const byId = records.find((r) => r.id === candidate)
const bySlug = records.find((r) => r.slug === candidate)
if (byId && bySlug && byId.id !== bySlug.id) return undefined
return byId ?? bySlug
```

This closes a real finding (Annika, 2026-07-23): a caller-supplied `id`
sharing a namespace with minted slugs meant a crafted record's `id` could
equal a victim's `slug`, and first-match resolution would silently shadow
the victim's URL. The registry now refuses that id shape at create time
(`project-registry.ts`/`workspace-registry.ts` `upsert()`), but this
resolver still treats ambiguity as unresolved on its own — the last line of
defense against any other path (legacy data, a bug elsewhere) that could
still produce the collision. When writing a new by-id-or-slug resolver
anywhere in this codebase, match this shape: check both, refuse on
disagreement, never trust list order to break the tie.

## When you reach for this

Any route segment that names a project, workspace, or session and feeds
either an authorization-relevant query or an outbound link. Resolve the
segment once against the nav summary at the route boundary, then thread
`.id` into every scope-keyed call and `.slug` into every URL you build —
don't re-derive either from the raw param further down the call stack.
