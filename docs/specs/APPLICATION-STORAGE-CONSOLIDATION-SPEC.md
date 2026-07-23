# Application storage consolidation

> Date: 2026-07-22
> Status: Proposed cross-repository architecture contract; implementation and
> upstream ownership pending.
> Consumer: Sigil Chat.
> Possible implementation owners: Mirk, Gonk, or a coordinated change across
> both. This spec deliberately defines the required behavior before assigning
> that ownership.

## Decision

Sigil Chat should configure ordinary application persistence once, at the host
composition root, and expose typed repositories over one logical application
database. A logical store namespace must not automatically become a separate
directory, database file, connection, environment variable, or lifecycle.

The normal local and small-deployment layout is:

```text
<SIGIL_DATA_DIR>/
├── sigil.db          # ordinary application records and artifact metadata
├── artifacts/        # large binary payloads
├── dev/              # disposable development receipts and generated secrets
└── eve/              # Eve-owned runtime data, only where Eve requires it
```

`SIGIL_DATA_DIR` is the one ordinary storage setting. Deployment-specific
overrides may remain for genuinely separate volume, database, or service
boundaries, but they are escape hatches rather than the default product model.

This decision does not require SQLite specifically. The initial implementation
may use Mirk's SQLite adapter because it is already in the dependency graph, but
the contract is one host-configured transactional application database with
logical namespaces.

## Problem

The current stack has a useful logical abstraction but an undesirable physical
result:

1. Sigil repositories independently create scopes and store providers.
2. Callers request a store by `(scope tier, namespace)`.
3. The installed Gonk/Mirk integration resolves that tuple to a namespace
   directory.
4. The Mirk backend creates `store.db` inside each resolved directory.

Projects, workspaces, scope grants, scope links, agent-thread ownership, Eve
session ownership, memory, persona, graphs, reviews, and other application
records can therefore acquire separate paths and database handles despite being
one application's state.

This is not a database-per-record or database-per-request failure. Repository
instances are generally long-lived. It is nevertheless the wrong operational
boundary: adding a logical repository can add physical storage topology, backup
surface, connection lifecycle, reset behavior, and diagnostic burden.

The ownership of that behavior is not decided here. It may be:

- a Mirk limitation if one adapter instance cannot safely partition multiple
  logical stores inside one database;
- a Gonk factory problem if its `(tier, namespace)` backend factory forces one
  backend and path per namespace;
- a Sigil composition problem where repositories construct providers instead
  of receiving one host-owned provider;
- or, most likely, a narrow change in all three layers.

## Architectural invariant

Physical persistence topology belongs to the host. Logical storage semantics
belong to repositories and portable capability packages.

Neither a Gonk capability nor a Sigil repository may decide that its namespace
requires a new database file. Mirk may provide the database implementation,
transactions, migrations, collections, search, vectors, and blobs. Gonk may
provide portable store interfaces, scope-aware naming, and authorization-aware
facades. Sigil owns which database and directories its deployed application
uses.

## Target composition

Each process creates one application-store composition and injects repository
handles from it:

```ts
const stores = createSigilStores({
  databaseUrl: resolveApplicationDatabase(environment),
  artifactDir: environment.artifactDir,
})

const projects = stores.kv("sigil.projects.v1")
const workspaces = stores.kv("sigil.workspaces.v1")
const scopeGrants = stores.kv("sigil.scope-grants.v1")
const scopeAudit = stores.log("sigil.scope-audit.v1")
```

The exact API is illustrative. The required properties are:

- the host chooses and opens the backend;
- repositories receive handles or a provider through dependency injection;
- namespaces remain logical partitions inside the configured backend;
- repeated requests for a namespace reuse the host's backend lifecycle;
- two processes opening the same application database observe consistent state;
- server-only storage dependencies never enter browser bundles.

This does not require one global mutable singleton. Tests must be able to inject
isolated in-memory or temporary backends. Production composition should be
explicit and process-scoped.

## What belongs in the application database

By default, store ordinary structured product state together:

- projects, workspaces, memberships, preferences, and scope links;
- application-thread records and immutable execution bindings;
- grants, revocations, policy records, and audit receipts;
- blackboard metadata and structured application documents;
- graph and review state;
- artifact metadata, lineage, media type, size, and ownership;
- product-owned memory/persona records where their upstream contract permits a
  host-selected backend;
- schema version and migration receipts.

These remain distinct repositories and logical namespaces. Consolidating the
database does not flatten their types, authorization, retention, or ownership.

## What remains outside

Do not force every byte into one database merely to claim a single file.

- Large artifact bytes remain under `artifacts/` unless measured evidence
  supports database blob storage. Their metadata and authorization records live
  in the application database.
- The external roadmap remains its own Git-versioned, human-authored Markdown
  repository. Git history and cross-worktree editing are part of that store's
  product contract.
- Checked-in fixtures remain source-controlled authored configuration.
- Eve-owned runtime state may remain in Eve's supported storage location. Sigil
  must not copy or reinterpret Eve's internal database.
- Better Auth may retain its supported database schema and adapter boundary. It
  may share the same database deployment when officially supported, but this
  spec does not require merging auth tables into a custom store abstraction.
- Generated development credentials and single-use login receipts remain
  disposable files under `dev/`; they are not product records.

## Required storage semantics

Consolidation is not acceptable unless the selected implementation proves:

1. **Transactions.** Multi-record invariants can commit or roll back atomically.
2. **Concurrency.** TanStack and Eve can read and write concurrently without
   lost updates, torn writes, or process-local locking assumptions.
3. **Compare-and-set.** Revisioned repositories can reject stale writes.
4. **Durability.** A reported successful write survives process restart.
5. **Isolation.** Tests and worktrees can select independent database roots.
6. **Migrations.** Schema changes and legacy imports are versioned, idempotent,
   restart-safe, and observable.
7. **Backup consistency.** One documented operation captures a restorable
   application database plus referenced artifact bytes.
8. **Lifecycle.** Connections are reused within a process and closed cleanly.
9. **Namespacing.** One repository cannot collide with another repository's
   records, tables, migrations, vector dimensions, or indexes.
10. **Authorization ordering.** Consolidation does not move authorization into
    the generic database. Application policy still runs before reads or writes.

For SQLite, the proof must include WAL behavior, busy timeout, transaction
boundaries, crash recovery, and two-process contention. Merely opening the same
file from two processes is not sufficient evidence.

## API boundary to resolve upstream

The implementation review must determine the narrowest correct ownership:

### Mirk candidate

Mirk owns the change if its adapter cannot expose one database instance with
multiple isolated logical collections, facets, or repositories. The desirable
surface is a host-opened database/backend whose namespaces are data keys, table
names, or collection identifiers rather than filesystem paths.

### Gonk candidate

Gonk owns the change if Mirk already supports shared logical collections but
`@gonk/store` constructs a new backend from every `(tier, namespace)` directory.
In that case Gonk should accept an injected shared backend/provider and map
scope plus namespace into logical partition keys without choosing physical
paths.

### Sigil candidate

Sigil owns the change if both upstream layers already support the target and
the fragmentation comes only from independently constructing providers in each
repository. Sigil should then create one provider at each server composition
root and inject every repository.

### Decision evidence

Do not assign ownership from package names or architectural preference. Build a
minimal proof that opens one temporary database, creates at least two namespaces
through the public APIs, writes from two independent handles, closes, reopens,
and verifies isolation and durability. Inspect which layer prevents that proof
from using one backend lifecycle and one file. That obstruction owns the first
change.

## Migration

1. Inventory every application-owned store, physical path, namespace, schema,
   process owner, writer count, retention rule, and backup requirement.
2. Build the public-API ownership proof above in an upstream worktree.
3. Ratify the implementation owner and publish the required package release.
4. Add a Sigil composition root that creates the consolidated provider and
   injects repositories without changing their behavior.
5. Import legacy namespace databases and JSON/Markdown application stores into
   the consolidated database. Record a receipt only after every source has been
   verified.
6. Leave legacy files untouched during the first successful migration. Do not
   delete them automatically.
7. Run old/new parity tests over counts, identifiers, revisions, scope
   ownership, grants, artifacts, graphs, reviews, and session bindings.
8. Cut normal startup, health, reset, backup, restore, Compose, and diagnostics
   to the consolidated layout.
9. Remove per-store path configuration and constructor-owned providers after a
   supported rollback window.

No dual-write compatibility period is preferred. If unavoidable, it must have
one named authoritative side, deterministic reconciliation, metrics, and a
removal date.

## Development and operations

`pnpm dev` should prepare one worktree-local data root and require no knowledge
of repository namespaces or their paths.

`pnpm dev:reset` should quarantine the consolidated application database,
artifact directory, Eve-owned disposable runtime state, and development
receipts as one recoverable reset unit. It must continue to exclude the
external roadmap, checked-in fixtures, `.env`, agent tooling state, and other
worktrees.

Readiness should report application-database migration and writeability failures
in product terms. It should not expose internal namespace directories as normal
operator concepts.

A deployment backup manifest must bind the database snapshot to the artifact
snapshot it references. Restoring only one side must fail verification rather
than silently produce dangling metadata or orphaned bytes.

## Deletion target

After migration, remove:

- repository constructors that create their own production scope/provider;
- namespace-to-directory resolution from the normal application path;
- one-database-per-namespace files and connections;
- redundant per-store environment variables used only to reproduce the old
  topology;
- app-specific JSON file stores superseded by transactional repositories;
- compatibility readers once legacy import and rollback gates close;
- documentation that teaches developers the internal location of each logical
  store.

Keep repository interfaces, logical namespaces, injected test stores, authored
Markdown stores, binary artifact storage, and deliberate deployment overrides.

## Acceptance

The work is complete when:

- a clean Sigil Chat instance needs one ordinary data-root setting;
- ordinary application records live in one configured transactional database;
- adding a logical repository does not create a new physical database or env
  variable;
- TanStack and Eve pass a real two-process concurrent read/write proof;
- repository transactions, CAS, restart durability, and authorization ordering
  pass through public APIs;
- migration from the current namespace layout is complete, idempotent, and
  rollback-safe;
- backup and restore reproduce both records and artifact references;
- `pnpm dev`, readiness, reset, Compose, and deployment use the consolidated
  layout;
- the external roadmap, fixtures, Eve internals, and large artifact bytes retain
  their intentional storage models;
- no product repository constructs an uninjected production provider;
- the final implementation record names which changes belonged to Mirk, Gonk,
  and Sigil based on evidence from the ownership proof.

## Stop conditions

Stop rather than papering over the boundary if:

- the public upstream API cannot share a backend without importing internals;
- the selected database cannot prove safe two-process writes;
- migration cannot distinguish authoritative records from stale compatibility
  copies;
- one-file consolidation would require absorbing the external roadmap, Eve's
  internal state, or artifact bytes against their real product contracts;
- a proposed Sigil-only facade merely hides the same per-namespace databases
  underneath.
