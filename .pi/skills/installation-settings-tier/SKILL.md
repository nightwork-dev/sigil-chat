---
name: installation-settings-tier
description: Use when adding a new owner-gated, installation-wide toggle (a flag, an allow-list, a deployment policy value). Covers the registry-plus-one-store pattern that extends rather than mints a second generic store, per this repo's CLAUDE.md.
---

# Installation settings tier

`apps/web/src/lib/installation-settings/registry.ts` and `store.ts` are the
one tier for **deployment policy** — "what does this deployment permit,"
answered the same way for every principal, writable only by the owner. It
is deliberately separate from `./user-settings/registry.ts`, which answers
"what does this person prefer": a per-user enabled set for something like
the model allow-list would let any member enable an expensive model for
themselves, which is exactly the failure the tier's owner-gating exists to
prevent.

This repo's CLAUDE.md forbids a second generic store. The tier already has
two consumers by design — model enablement and feature flags — and a third
owner-gated toggle extends it rather than minting a new one.

## The pattern: declare as data, store through one thing, enforce server-side

1. **Declare** a key in `registry.ts` with `defineInstallationSetting`: a
   `key`, a `defaultValue` (what an installation that never wrote this key
   resolves to), and an `isValid` type guard. The registry is pure and
   dependency-free on purpose — client code can import key names and
   validators without pulling the server store into the browser bundle.
2. **Store** through the one `InstallationSettingsStore` (`store.ts`),
   backed by the Gonk KV store at the `project` tier. `get()` returns the
   registered default when the stored value no longer validates — it never
   throws on read, because this runs on the synchronous session-creation
   path and "none enabled" is the safe answer, not "fail every new chat."
   `set()` throws `InstallationSettingRejectedError` on an invalid value.
3. **Enforce server-side only.** Reads are open to any signed-in principal
   (the server evaluates the same policy for everyone regardless of what
   the browser was told); writes are gated on the owner one layer up, in
   the domain's own `.server.ts` (`model-enablement.server.ts`,
   `feature-flags.server.ts`). Nothing in `registry.ts` or `store.ts`
   authorizes anything — they validate and persist.

Never register a key whose value is a credential, token, or per-principal
grant — the tier's contract is that its values are readable by everyone,
which is safe for policy and unsafe for a secret.

## Worked example: model enablement's two-gate composition

`model-enablement.ts`'s `isModelEnabledForNewSessions` composes two
independent decisions, and the order is load-bearing:

```ts
export function isModelEnabledForNewSessions(
  candidate: ModelEnablementCandidate,
  enabledIds: readonly string[],
): boolean {
  if (!candidate.enabled) return false
  if (isModelEnablementLocked(candidate)) return true
  return enabledIds.includes(candidate.id)
}
```

- **The author's `enabled: false` veto** — the fixture's own authored
  `enabled` flag. An owner cannot override it from the UI; the fixture is
  the only place that changes it. This gate runs first and short-circuits.
- **The owner's installation-enabled set** (`ENABLED_MODELS_KEY`,
  `"models.enabled"`) — an allow-list, not a deny-list, because the failure
  it's designed against is "a new model like Fable gets added and
  suddenly users can burn through quota" (David, 2026-07-31). Only
  explicitly-enabled ids are selectable; a newly-discovered model is in the
  same not-yet-selectable position as one that never existed until the
  owner enables it.

Selectable means **both** gates pass — an author can retire a model without
depending on every deployment remembering to un-enable it, and the
deployment default (`isModelEnablementLocked`) can never be turned off
because a session created without a model runs it.

## Where feature flags land in the same tier

`feature-flags.ts` is structurally the same split for a reason:
`FEATURE_FLAG_OVERRIDES_KEY` (`"flags.overrides"`) holds one
`{ [flagId]: boolean }` map for *every* declared flag, not a new store key
per flag. Adding a flag means adding a declaration to
`feature-flags/registry.ts` — this key, the store, and the owner-gated
write path do not move. `isFeatureFlagEnabled` treats an undeclared id as
default-off (loudly, in dev) rather than trusting whatever a stale override
map says about it.

## When you reach for this

The next owner-gated, installation-wide toggle — a new deployment policy
value, not a per-user preference and not a secret — extends this tier:
declare a key in `registry.ts`, read/write through
`InstallationSettingsStore`, gate the write in that domain's own
`.server.ts`. Don't create a new KV namespace, a new store class, or a
bespoke settings file for it.
