---
name: home-signals-scope-visibility
description: Use when adding any home-surfaced signal or resource kind (activity, attention, work, resources) to a project/workspace/session home. Covers the three visibility invariants that keep the view-model from leaking what a hidden scope contains.
---

# Home-signals scope visibility

`apps/web/src/features/homes/home-view-model.ts` (the adapter) and
`types.ts` (the contracts) sit between the authorization-neutral
`ProjectWorkspaceNavSummary` — which already arrives permission-filtered,
with hidden scopes omitted and hidden owners' `projectId` absent — and the
home components. The adapter's job is **ordering and shaping only, never
recovery.** `types.ts` states the three rules the spec makes contractual,
and every new signal or resource kind must hold them too.

## 1. The view-model never reconstructs a hidden owner

`canonicalOwnerName` on a mounted workspace or resource row is populated
only by looking the owner up in the already-visible nav summary
(`ownerName` in `home-view-model.ts` does `nav.projects.find(...)`, nothing
more). If the owning project isn't in `nav.projects`, the name is omitted —
never substituted, never inferred from the mount record itself. A
`RestrictedRow` (a mount the discovery policy surfaced without access)
renders with **no id and no name**, only a `label` and `restricted: true` —
existence is all the discovery policy permits.

## 2. Never substitute personal scope for a hidden one

`resolveViaLabel` only honors an entered-via project when three conditions
all hold on data already visible: the workspace exists, the via-project id
exists in `nav.projects`, and the workspace's own `mountedProjectIds`
actually lists it. If any of those fails, the function returns `undefined`
— it does not fall back to guessing the personal project or any other
default. A caller that gets `undefined` back shows the plain canonical
path, not a filled-in placeholder.

## 3. Via-path is display-only

`OwnershipLabel.enteredViaScopeId`/`enteredViaName` exist so a click can
carry the perspective a user arrived by (`workspaceHref`/`sessionHref`
append `?via=<projectId>` only when `viaProjectId` is defined) — but the
type comment is explicit: "carrying it confers nothing" (spec §7). The via
param changes what link text and breadcrumb a component shows; it must
never be read anywhere as a scope key, an authorization input, or a
substitute for the resolved `.id` a query actually runs against (see
the route-identity-discipline skill for the general id-vs-display-alias rule this
specializes).

## Where the actual data comes from

`home-signals-projector.ts` builds the `activity`/`attention` arrays
straight from each thread's own runtime event log
(`thread.runtime.events`), filtered by `threadBelongsToHome` — a thread only
contributes signals to a home if its `executionBinding.homeScopeId` (or a
workspace mount reachable from it) resolves to that home's id. This is the
same discipline from the opposite direction: a signal is attributed to a
home only through data the thread's own binding already establishes, never
by matching on a display field.

## When you reach for this

Adding any new home-surfaced signal or resource kind — a new `ActivityItem`
variant, a new `ResourceRow` kind, a new cross-scope label. Before wiring
it: does the label/owner/via field it adds come only from something already
present in the permission-filtered nav summary or the item's own binding? If
producing it requires looking past what's visible, or substituting a
default when the real owner is hidden, that's the leak this skill exists to
name — a violation here is an information leak, not a styling bug, and it
should be caught in review the same way a missing auth check would be.
