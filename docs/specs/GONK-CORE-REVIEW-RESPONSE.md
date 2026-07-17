# Gonk Core response: context, skills, retrieval, and MCP auth

> Date: 2026-07-16
> From: Gonk Core implementation review
> Status: Core auth approved; context/skills/retrieval request changes

## Immediate MCP auth status

The demonstrated `@gonk/tool-registry-mcp@0.0.23` session-reuse defect is
tracked and fixed on Gonk branch `feat/auth-support` in:

```text
a development worktree of the Gonk Core repository
```

The Web handler now stores:

```ts
Mcp-Session-Id -> {
  transport,
  securityContextKey,
}
```

It reauthenticates every POST, GET, and DELETE, permits refreshed claims only
when the security-context key remains the same, rejects a changed subject,
delegated actor, tenant/workspace, or delegated actor session with the same
unknown-session response as a missing session, and preserves the legitimate
principal's session after a mismatch.

Tests cover Alice/Bob session reuse, refreshed Alice claims, changed delegated
actor session, POST/GET/DELETE mismatch handling, and legitimate-session
preservation.

We also decided not to preserve the published top-level:

```ts
authorize({ tool, input, request, approval });
```

callback. It had no typed principal or discovery policy and required a
fabricated `legacy-client` identity to participate in registry enforcement.
`makeAuthContext` is now the sole authenticated MCP policy seam.

The known Sigil consumer at `apps/gonk/src/server.ts` must remove:

```ts
authorize: ({ approval }) => approval.tier !== "exec";
```

That rule is consent/risk policy, not caller identity policy. It should move to
the registry `ApprovalProvider`. If Sigil later needs identity/tenant policy,
that belongs in a real `AuthContext`.

The revised HTTP adapter is fail-closed in two additional ways:

- a mounted credential-free handler requires explicit `allowInsecure: true`;
- authenticated exposure requires `makeAuthContext`, unless the host explicitly
  chooses `allowUnrestrictedTools: true` trusted-service mode.

For Sigil's current single-service bearer, the short migration is:

1. construct `ToolRegistry` with an `ApprovalProvider` that denies the `exec`
   tier and approves the intended lower tiers;
2. remove the old `authorize` callback;
3. set `allowUnrestrictedTools: true` only while the bearer represents one
   trusted service principal and there is no finer identity policy;
4. replace that flag with `makeAuthContext` when Sigil introduces
   tenant/workspace/member policy.

The agent MCP route must use an Eve/audience-bound bearer or equivalent
credential, not an ambient browser session cookie. Delegated Eve principals
must include `actorSessionId` for stateful MCP session binding.

## Overall package judgment

Do not merge context compilation, skill management, and retrieval into one
package.

Use three Core domain packages:

- `@gonk/context`
- `@gonk/skills`
- `@gonk/retrieval`

They share `@gonk/auth`, `@gonk/scope`, `@gonk/store`, Standard Schema boundary
validation, correlation IDs, deterministic ordering, and redaction
conventions. Their registries and receipts are not interchangeable:

- a context contributor is an in-process producer for one compile;
- a retrieval source owns discovery, health, indexing, ranking, and resolution;
- a skill registry owns scoped filesystem lifecycle, shadowing, staging,
  archives, and revisions.

Likewise, keep domain receipts distinct. Share an envelope convention
(`version`, request/correlation id, timestamp, policy/config version, redaction
mode) and reference related auth receipts. Do not create a universal receipt
payload or generic registry substrate before repeated implementation proves
one.

## Sequencing

Auth shipped first. Core `0.2.0` now publishes deliberately small
`@gonk/context`, `@gonk/skills`, and `@gonk/retrieval` packages. The first
consumer path is Sigil Chat's server-side Eve context compilation:

- serializable candidate and resource-reference contracts;
- runtime contributor registry;
- authoritative resolution and two authorization gates;
- canonical resource-key deduplication;
- deterministic ordering and budgeting;
- required-context blocked outcome;
- token estimator seam;
- redacted context receipt;
- exported Standard Schema request/result validators.

Context is the downstream model-visibility boundary. It is not the foundation
of skill storage/lifecycle or retrieval search/indexing. Those packages may
build and ship independently, then expose adapters that produce context
candidates.

After the minimal context contract, Gonk can proceed with two independent
consumer-pulled verticals:

1. lift the existing skill registry's authorized read path into Core for
   Sigil's catalog/detail UI;
2. build retrieval contracts and the lexical/citation baseline against one
   real Sigil adapter.

Neither should wait for semantic retrieval, full skill mutation, or compiler
host-hook migration.

## `AGENT-CONTEXT-MANAGEMENT-SPEC.md`

Verdict: approve direction; request changes before treating the Core contract
as implementation-ready.

Required changes:

1. Split the serializable `ContextCandidate` from executable contributor and
   resolver callbacks. Candidates crossing tools/HTTP/MCP contain resource
   references, not functions.
2. Define two authorization gates:
   - candidate discovery before resolving hidden content;
   - authoritative content use after the contributor resolves current
     revision, sensitivity, audience, and content.
3. Separate:
   - `candidateId` — unique within a compile;
   - `contributorId` — registered producer;
   - `resourceKey` — stable dedup/exclusion/pin identity;
   - `revision` — frozen or current source revision.
4. Make required context representable. Add a closed necessity policy and a
   compile result such as `status: "ready" | "blocked"` with structured
   blocking reasons.
5. Keep executable contributors in a runtime registry. Scope may control
   enablement, caps, and ordering; it must not store/register functions.
6. Export Standard Schema validators for every boundary request/result.
7. Replace open lanes/source/provenance unions and opaque metadata bags with
   closed discriminants plus registered contributor IDs and schema-bound
   payloads.
8. Token accounting should report estimator quality
   (`fallback | model-aware | exact`). Provider-reported prompt usage is an
   aggregate, not generally an actual per-candidate token count.
9. Persist saved-set references only, not cached labels, summaries,
   sensitivity, or token estimates.

The older `docs.local/context-compiler-v0-spec.md` decision to incubate only in
extensions is now stale: Sigil is a real non-extension consumer and Gonk
already has multiple independent host injection paths. Promote a narrow pure
contract to Core now, but do not freeze the old spec's broad Jinja/migration
machinery into the first release.

## `AGENT-SKILL-MANAGEMENT-SPEC.md`

Verdict: approve Core ownership; request changes. This is a lift and hardening
project, not a greenfield registry.

The existing extension implementation already supplies scope shadowing,
CRUD/supporting files, archive/restore, structurally invisible staging,
promotion, pin/usage metadata, freshness probes, and tool projections. Mine its
implementation and fixtures, move the canonical contracts into Core, migrate
consumers, then deprecate the extension package.

Required changes:

1. Remove ambiguous `invoke` terminology:
   - `read` inspects authorized content;
   - `attach` selects a skill for turn/session consideration;
   - `activate` produces a context candidate and activation receipt.
     Supporting executables remain separately authorized tool calls.
2. Add an explicit migration release: the extension re-exports Core, current
   memory/recall/persona/reflector consumers migrate, then the extension is
   deprecated.
3. Define mutation requests with `expectedRevision`, idempotency key, content
   hashes, and structured conflict results. The current copy/rewrite/delete
   implementation does not yet satisfy the requested concurrency claims.
4. Replace `SkillOrigin | string` with a closed discriminated origin carrying
   opaque adapter/package identifiers as data.
5. Replace independent `staged?` and `archived?` booleans with a closed
   lifecycle discriminant.
6. Separate readiness, attachment, activation reason, and compiler disposition;
   they are different dimensions, not one state.
7. Normalize the provenance/freshness vocabulary.
8. Require Standard Schema validators and closed action unions for every tool
   request/result.

First Core slice:

- canonical read-only records and schemas;
- `list`, `get`, `getAll/resolve`, search, supporting-file tree, shadowing;
- structural exclusion of `.staging` and `.archive`;
- authorized `skill.list` and `skill.get` tools;
- conformance fixtures lifted from the existing extension;
- compatibility re-export.

Mutation follows after revision/atomicity contracts. Activation follows the
minimal context package. Testing and curation remain later.

## `AGENT-RETRIEVAL-SPEC.md`

Verdict: request changes, but this is the strongest architecture of the three.
Lexical-first, source-labelled retrieval with late authoritative resolution is
the right direction.

Required changes:

1. Resolve the excerpt/gate contradiction. Either:
   - search hits are metadata-only until `resolve`; or
   - search internally performs the final content-use authorization gate before
     returning an excerpt.
     A snippet is content.
2. Pass canonical Gonk `AuthContext` to `scan` and every other operation that
   crosses an authorization boundary. Do not introduce a second
   `RetrievalSecurityContext`.
3. Core must independently authorize adapter-returned references; adapters
   cannot broaden the supplied principal.
4. Caller-visible denial counts may include only candidates beneath sources the
   principal was allowed to discover. Hidden-source matches contribute no
   observable count.
5. After access revocation, preserve citation id, immutable resource ref,
   original audience classification, and excerpt hash. Do not return the old
   label/excerpt without current authorization to inspect the historical
   artifact.
6. Specify atomic index publication. Current `@gonk/store` has no transaction or
   atomic multi-index replacement. Prefer immutable index generations plus one
   atomic publication pointer, or define a retrieval storage SPI with
   `publishGeneration`.
7. Do not use `@gonk/scope` tiers as authorization boundaries. Tenant/workspace
   authority comes from the principal.
8. Declare source revision capability:
   `current-only | historical`.
9. Replace `filters?: Record<string, unknown>` with per-source Standard Schema
   filters. JSON Schema is the projection; Standard Schema is the validator.
10. Treat `VectorStore` metadata predicates as optimization only, never
    authorization. Retrieval owns typed, serializable constraints and
    reauthorizes returned references.
11. Canonicalize revisions to opaque strings and make fragment references a
    proper discriminated union.

First retrieval slice:

- contracts and in-memory security fixtures;
- immutable-generation lexical index;
- stable resource/revision/fragment identity;
- tombstones;
- citation resolution;
- one real Sigil adapter;
- no required embedding provider.

Context contribution comes later through a narrow adapter. Retrieval remains
useful for user search, inspection, attachment, and citations without model
injection.

## Closed unions and schemas

Gonk agrees with the rule for protocol contracts:

- package-owned actions, states, modes, outcomes, and reason codes are closed;
- extensibility appears as registered opaque IDs carried inside closed
  discriminated records;
- contributor/source/host-specific payloads are paired with runtime Standard
  Schema validators;
- no `| string` escape hatches on discriminants;
- no unvalidated `Record<string, unknown>` filter bags.

The auth worktree was corrected during this review: Core-owned authentication
methods, actions, resource kinds, and scopes are closed; application extensions
use explicit `custom:*` / `application:*` namespaces; and resource metadata is
schema-narrowable `unknown` rather than a public `Record<string, unknown>` bag.
