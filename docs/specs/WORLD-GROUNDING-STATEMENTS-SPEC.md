# World-grounding statements and epistemic context

> Date: 2026-07-30
>
> Status: Proposed cross-repository architecture contract; consensus planning
> approved, implementation not started.
>
> Consumer: Sigil Chat and interactive narrative/game compositions.
>
> Upstream owners: Gonk for host-neutral contracts and authorization-aware
> projections; Mirk for physical persistence, transactions, indexing, and
> migrations.
>
> Related:
> [`KB-DESIGN-RECOMMENDATION.md`](KB-DESIGN-RECOMMENDATION.md),
> [`APPLICATION-STORAGE-CONSOLIDATION-SPEC.md`](APPLICATION-STORAGE-CONSOLIDATION-SPEC.md),
> and the Gonk context/retrieval contracts.

## Decision

Add a host-neutral Gonk **statements** capability, backed by Mirk, for
contextualized assertions, events, provenance, revision history, and
actor-relative epistemic views.

The existing Gonk knowledge and triples capabilities remain useful:

- authored knowledge pages remain the human-readable corpus;
- temporal subject-predicate-object triples remain a simple query and
  compatibility projection;
- statements become the authority when a proposition needs identity,
  provenance, modality, context, branch/time scope, contradiction, or an
  actor-relative belief/perception view.

The canonical model is not “the world is triples.” It is:

```text
Proposition = subject + predicate + object

Statement = proposition
          + stable identity
          + context
          + modality and polarity
          + valid time and recorded time
          + status and confidence
          + qualifiers
          + provenance and derivation
          + immutable revision history
```

Mirk may store this model in SQLite or another supported backend. RDF,
JSON-LD, named graphs, and property-graph forms are interchange or projection
formats, not storage mandates.

## Why pages and bare triples are not enough

Authored pages answer “what do our sources say?” They are the right unit for
explanation, interpretation, and human revision.

Bare triples answer “what relation is asserted between these two terms?” They
are compact and useful for bounded graph lookup.

World grounding also needs to answer:

- Who asserted this, and from which source?
- Is it accepted world truth, a character belief, a rumor, a hypothesis, or a
  rejected claim?
- When was it true in the world, and when did the system record it?
- In which world, branch, scene, or scope is it valid?
- Does another source contradict it?
- What event changed it?
- Which actor perceived the event, and what are they now entitled to believe?
- Why did this statement enter a prompt while another one did not?

Adding optional fields to the current triple or game-claim shapes would make a
projection format masquerade as the authority. The separate statements
capability keeps the canonical semantics explicit and lets triples remain
simple.

## Research synthesis

This contract adapts several mature ideas without adopting any one formalism
wholesale.

| Source                                                                                          | Useful idea                                                                                                                                                                                      | What this contract does not copy                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [RDF 1.2 Concepts](https://www.w3.org/TR/rdf12-concepts/)                                       | A proposition can be referred to without asserting it; reifiers can represent claims, beliefs, situations, or events related to the same proposition; datasets and named graphs provide context. | RDF storage, global IRIs, or RDF entailment are not required.        |
| [RDF 1.2 Semantics](https://www.w3.org/TR/rdf12-semantics/)                                     | Formal entailment makes the consequences of an asserted graph explicit.                                                                                                                          | Monotonic, open-world entailment is not the mutable game referee.    |
| [Wikibase data model](https://www.mediawiki.org/wiki/Wikibase/DataModel)                        | A statement carries a main claim, qualifiers, references, rank, and explicit unknown/no-value forms.                                                                                             | Wikibase entities and APIs are not adopted as the runtime.           |
| [PROV-O](https://www.w3.org/TR/prov-o/)                                                         | Derivation, revision, quotation, attribution, and primary-source relations are distinct.                                                                                                         | Full PROV-O serialization is optional.                               |
| [OWL-Time](https://www.w3.org/TR/owl-time/)                                                     | Instants, intervals, duration, and temporal relations should not be improvised as strings.                                                                                                       | The first slice does not implement the entire ontology.              |
| [SHACL](https://www.w3.org/TR/shacl/) and [SHACL 1.2 Core](https://www.w3.org/TR/shacl12-core/) | Versioned shapes can validate authored graphs and provide structured reports without turning validation into inference.                                                                          | Shapes govern accepted data; they do not decide world truth.         |
| [W3C n-ary relation pattern](https://www.w3.org/TR/swbp-n-aryRelations/)                        | Relations with qualifiers or more than two participants need an identity-bearing relation/event node.                                                                                            | Every simple relation does not become an aggregate.                  |
| [Event Calculus](https://rair.wp.rpi.edu/files/2015/01/EC-Explained.pdf)                        | Events initiate and terminate time-varying fluents while history remains inspectable.                                                                                                            | The first slice does not require a general theorem prover.           |
| [Epistemic actions over belief bases](https://proceedings.kr.org/2022/24/)                      | `inform`, `perceive`, `revise`, `conceal`, and `announce` can update explicit belief bases without enumerating every possible world.                                                             | Full possible-world epistemic logic is deferred.                     |
| [Comme il Faut](https://escholarship.org/uc/item/6x5933cw)                                      | Social state and authored social rules enable kinds of play that physical-state models miss.                                                                                                     | One universal social ontology is not imposed on every world.         |
| [Concordia](https://deepmind.google/research/publications/64717/)                               | A game-master/controller can admit actions and update a shared simulation while agents operate from partial context.                                                                             | Model output is never accepted as truth merely because it is fluent. |
| [Generative Agents](https://arxiv.org/abs/2304.03442)                                           | Retrieval, observation, reflection, and planning are distinct memory operations.                                                                                                                 | Free-form memory streams are not the canonical world model.          |
| [Nanopublication guidelines](https://nanopub.net/guidelines/working_draft/)                     | Small assertions can carry separate assertion provenance and publication provenance with integrity identifiers.                                                                                  | The runtime does not require nanopublication/RDF serialization.      |

The resulting design is a contextualized assertion-and-event graph with
explicit authority and projections.

## Canonical model

### Writable aggregates

`EntityRecord`

- Durable identity for a participant, place, object, concept, or named anchor.
- Owns aliases, declared types, and identity metadata.
- Does not own truth-bearing statement content.

`StatementAggregate`

- Owns statement identity, proposition, immutable revisions, current head,
  branch/world scope, admission history, and supersession/retraction chain.

`EventAggregate`

- Owns an admitted event and its attached effects.
- Events may initiate or terminate truth-bearing fluents.
- A proposed event does not affect world truth until the authorized referee or
  application policy admits it.

`SourceAggregate`

- Owns a source identity, stable anchors, publication metadata, and source
  integrity/provenance information.

`WorldPackageAggregate`

- Owns a data-only package identity, version, activation state, replacement
  rules, ontology extension version, and validation result.

### Value objects and projections

- `Proposition`: normalized subject, predicate, and object inside a statement.
  An object may reference another statement's identity, so a first-order
  belief about another actor's knowledge is representable without
  nested-possible-world semantics.
- `Context`: world, branch, scope, actor, scene, and applicable time.
- `Effect`: an event-attached mutation proposal, not an independent truth root.
- `Perception`: an epistemic projection derived from an event, observer,
  sensory/visibility rules, and admission policy.
- `OntologyTerm` and `Shape`: versioned governance metadata.
- `TruthLens`, `EpistemicLens`, and `ProvenanceLens`: query projections.
- `TripleProjection` and `DocumentProjection`: compatibility/read projections.

## Statement revisions and authority

All authoritative statement mutations use one admission service:

```ts
statements.admit(request);
statements.revise(request);
statements.retract(request);
```

Every request carries:

- authenticated principal;
- authority scope and caller policy;
- idempotency key;
- world and branch;
- statement identity;
- valid time and recorded time;
- source/provenance;
- expected revision for revision or retraction.

Semantics:

- `admit` creates the first immutable revision.
- `revise` appends a revision only when `expectedRevision` matches the current
  branch head.
- `retract` appends a terminal revision; it never deletes history.
- Exact replay of an operation returns the original revision and receipt even
  after the head moves.
- Reusing an idempotency key with another normalized envelope fails with
  `idempotency-conflict`.
- A new key against a stale head fails with `revision-conflict`.
- A second retraction with a new key fails because the branch head is already
  terminal.

Authority is a four-state machine — `proposed` / `accepted` / `rejected` /
`superseded` — and is orthogonal to provenance. Source-backed is a provenance
quality, not an authority state: a fully-cited claim can still be proposed,
contradicted, or superseded. Acceptance is an act of the authorized
principal, never a side effect of extraction confidence or model fluency.

Gonk defines the host-neutral contract and authorization inputs. One
Mirk-backed adapter serializes the commits, built on the Mirk store's existing
coordination primitives rather than a second bespoke serialization mechanism.
A consumer asks for a mutation; it does not independently commit world truth.

## Time, branches, and contradiction

Every statement revision distinguishes:

- **valid time**: when the proposition applies in the represented world;
- **recorded time**: when the substrate admitted the revision.

Valid time is interval-valued, and intervals may carry precision qualifiers.
Learning, forgetting, correction, and repudiation are represented by opening
and closing intervals, never by deleting records. The kernel must not require
every valid time to resolve to comparable instants: a represented world may
date a fact only partially ("before the reclamation"), and that partial order
is preserved rather than fabricated into a precise date.

Branch is part of the revision identity. One stable statement may therefore
have distinct branch histories without merging those histories implicitly.

Contradictory statements remain separate statements with their own sources,
contexts, status, and provenance. Retrieval does not average them into a
synthetic certainty. A lens may rank, filter, or present contradictions, but it
must preserve the underlying disagreement and explain its selection.

## Truth and epistemic lenses

`TruthLens(context, time)`

- Returns the admitted current truth for the requested world/branch/time.
- Applies retraction and supersession rules.
- Does not include private beliefs merely because an actor holds them.

`EpistemicLens(actor, context, time)`

- Returns what an actor is entitled to know, believe, remember, infer, or
  misbelieve.
- May intentionally disagree with the truth lens.
- Is updated by explicit epistemic operations such as `perceive`, `inform`,
  `infer`, `revise`, `conceal`, and `announce`.

`ProvenanceLens(statement)`

- Returns source anchors, derivation, revision, quotation/attribution, and
  admission receipts.

Three rules bind every lens implementation:

- **Falsity is derived, never stored.** The substrate stores the belief —
  proposition, holder, stance, time, provenance. No stored field asserts that
  a belief is false; wrongness is always a query-time comparison between the
  epistemic lens and the truth lens at the same time and branch. When world
  truth is revised, every dependent wrongness answer changes with it, with no
  stored annotations to chase.
- **Lens answers are five-way, not boolean**: explicitly-knows /
  explicitly-believes-or-suspects / explicitly-unaware / plausibly-available /
  no-record. Absence of a record is not recorded unawareness, and
  plausibility is not entitlement. A consumer-owned coarse competency policy
  may mark a proposition plausibly available and guide retrieval; it never
  entails knowledge of a specific proposition, and explicit records always
  override it.
- **No silent reconciliation.** No summarizer, compactor, scheduled job, or
  import reconciles an actor-scoped statement toward world truth. Corrections
  are durable events with before/after references.

The first implementation need not model nested possible-world beliefs. It must
model first-order actor belief and perception faithfully enough that an actor
can be wrong without the prompt quietly correcting them.

## Retrieval and prompt construction

The safe order is:

```text
authenticate principal
  → resolve authority and visibility
  → choose truth/epistemic lens
  → gather authorized candidates
  → rank
  → apply prompt budget
  → compile prompt
  → emit audience-appropriate receipt
```

Unauthorized candidates do not enter ranking, prompt budgeting, model-visible
receipts, player UI, or exported support receipts. Privileged developer/debug
surfaces may inspect hidden-candidate metadata only under an explicit debug
scope.

The host owns ranking policy and prompt budget. Gonk owns the portable query,
authorization-input, and receipt contracts. Mirk owns the efficient indexes
used to answer the authorized query.

The retrieval contributor is an instance of the shared authorized
retrieval-source contract described in
[`KB-DESIGN-RECOMMENDATION.md`](KB-DESIGN-RECOMMENDATION.md): one host
coordinator, one evidence-packet and receipt schema, one prompt-budget
scheduler, with statements and authored knowledge registered as separate
sources. Whichever capability lands that contract first defines it; the
second consumes it rather than forking a parallel injection path.

## Storage and compatibility projections

Mirk owns:

- transactions and optimistic concurrency;
- immutable revision and event records;
- idempotency-result storage;
- indexes for world, branch, actor, valid/recorded time, and provenance;
- schema migrations and resumable backfills.

The triple compatibility view is an envelope:

```text
subject + predicate + object
+ statement id
+ projection version
```

The bare triple is intentionally lossy. Full modality, time, context, and
provenance are recovered by canonical statement lookup through the pointer.
The projection is read-only from the moment the `statements/v1` contract
types exist (Stage 1), not merely after cutover: world-scoped data must never
be written through a pre-existing triple surface, because such a write
bypasses admission and every lens.

Authored knowledge documents remain a second projection: useful narrative over
statements and sources, not a replacement for either.

## Ontology and world-package boundary

The core ontology kernel remains deliberately small:

- entity identity and aliases;
- place/containment;
- participation in events;
- source and derivation;
- statement status, modality, and polarity;
- world/branch/time context;
- relationship predicates with namespaced extensions.

World packages may add versioned terms and shapes. Imports must preserve the
package's source-native status label separately from any normalized selection
policy. A package-specific distinction must not collapse into a boolean
`true/false` field merely because the generic substrate does not interpret it.

World packages are data:

- no package-supplied executable code runs during import;
- source paths/anchors, package version, status labels, and replacement rules
  remain inspectable;
- validation failure blocks activation without corrupting the previous active
  version.

## Ownership

| Layer                               | Owns                                                                                                                 | Must not own                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Mirk                                | Physical storage, transactions, indexes, migrations, resumable backfills.                                            | Game/referee policy, prompt ranking, ontology meaning. |
| Gonk                                | Statements API, provenance/ontology/query contracts, authorization inputs, projections, receipt schemas.             | Application-specific truth policy or UI.               |
| Sigil Chat / Eve                    | Host composition, verified principal, contributor registration, prompt budgets, authorized inspection surfaces.      | A parallel statements database or game truth rules.    |
| Interactive narrative/game consumer | World/campaign authority, branch/game time, event admission policy, perception rules, actor epistemics.              | A forked generic statement/provenance substrate.       |
| Authored world package              | Versioned entities, statements, sources, native status labels, ontology extensions, activation/replacement metadata. | Runtime code inside the data import.                   |

## First vertical slice

The first slice must prove all of these together:

1. One statement writes once and appears through both a truth lens and the
   versioned triple envelope.
2. An actor's false belief survives prompt construction without hidden truth
   leakage.
3. A branch-scoped event revises and retracts truth without erasing history.
4. A package import preserves four distinct source-native status labels and a
   conflict record.
5. A multi-source statement preserves derivation through revision, retraction,
   projection, and canonical pointer lookup.

Required held-out fixtures:

- truth/belief split;
- branch revision and retraction;
- package-native status preservation;
- prompt leak guard;
- provenance and triple-envelope recovery.

Each fixture specifies expected output separately for actor prompt, model
prompt, ordinary player UI, privileged referee/debug UI, and host receipt.

## Delivery stages

### Stage 0 — freeze contracts and evidence

- Ratify `statements/v1`, `triples-projection/v1`,
  `ontology-kernel/v1`, and `storage-schema/v1`.
- Freeze the migration crosswalk from existing claim/triple records.
- Freeze the authorization/receipt audience matrix.
- Freeze a benchmark corpus and query mix.
- Name the shared retrieval-contributor contract and the Mirk coordination
  primitive as imported dependencies of this capability, not new definitions.
- Reconcile the kernel against the knowledge models of existing and named
  future consumers, and record that crosswalk as Stage 0 evidence; ratify
  `ontology-kernel/v1` only against the reconciled vocabulary.
- Record clean/dirty checkout and worktree-isolation receipts for every repo.

### Stage 1 — contract-only Gonk surface

- Public types, validation, receipt schemas, lens interfaces, and the triple
  envelope.
- Contract-test in-memory adapter or explicit no-production-write stub.
- No production canonical writes or production lens queries.

### Stage 2 — Mirk production adapter

- Schema, migrations, idempotency results, persistence, indexes, and the first
  production admission/query adapter.
- Dual-read with current triples.

### Stage 3 — Sigil Chat/Eve composition

- Register an authorized retrieval contributor.
- Enforce actor-relative lens choice and prompt budgets.
- Emit receipts according to the audience matrix.
- Keep the current safer context path as a disable/fallback boundary.

### Stage 4 — game/interactive consumer migration

- Map current claims into statement identities without adding another layer of
  optional compatibility fields.
- Replace “inject every claim” with the epistemic lens.
- Admit referee effects through the canonical mutation service.

### Stage 5 — world-package import

- Data-only package format, native status preservation, validation, activation,
  and replacement.

### Stage 6 — retire old read paths

- Remove direct claim injection only after dual-read parity, leak fixtures,
  migration receipts, and benchmark gates pass.
- Keep the triple projection until all legacy consumers migrate.

## Acceptance gates

Contract:

- Missing identity, context, source, time, or provenance fails validation.
- Admission replay and conflict behavior is deterministic.
- Triple envelope plus canonical lookup recovers the statement and provenance.

Security:

- Visibility filtering precedes ranking.
- Actor/model/player surfaces reveal no hidden-candidate existence metadata.
- Only explicitly privileged debug scope can inspect hidden candidates.

Migration:

- Every legacy claim maps or appears in an unresolved backfill report.
- Dual-read preserves player-visible behavior except for the intended new
  separation of truth, belief, and provenance.
- Every cutover has release, migration, and verified rollback receipts.

Player-visible:

- False belief is not silently corrected.
- Contradictions remain inspectable.
- Event revision/retraction preserves history.
- Package-native statuses remain distinct.

Performance:

- Stage 0 records corpus id/hash/version, query mix, hardware/runtime notes,
  cold/warm method, p50/p95, prompt bytes, and selected/omitted counts.
- Initial launch gate: p95 no worse than `baseline * 1.20`; prompt bytes no
  worse than `baseline * 1.10`.
- A failed gate blocks cutover unless a separately approved performance
  decision receipt accepts the measured tradeoff.

## Alternatives

### Extend the triple store in place

Initially smaller, but it makes a lossy projection canonical and grows into a
nullable-field pile. Rejected as the authority; retained as a projection.

### Keep the semantics entirely in the game consumer

Reduces early cross-repo coordination but duplicates statement, provenance,
authorization, and receipt behavior for every consumer. Rejected.

### Adopt an RDF/OWL database and reasoner as the runtime

Provides standards-based interchange and reasoning, but storage choice and
monotonic open-world entailment do not match mutable, branch-scoped referee
authority. Rejected as a runtime mandate; RDF/JSON-LD export remains possible.

### Use embeddings and prompt dossiers only

Useful for relevance, but cannot serve as inspectable authority for truth,
belief, contradiction, provenance, revision, or branch history. Rejected.

## Risks

- Projection becomes authority: prohibit authoritative triple writes after
  cutover and verify pointer recovery.
- Hidden truth leaks through receipts: make the audience matrix the source of
  truth and omit hidden-existence metadata by default.
- Ontology work swallows delivery: freeze the small kernel and require a
  concrete fixture before adding a core term.
- World packages flatten their source distinctions: preserve native labels and
  validate round trips.
- Migration grows the legacy claim shape: keep a separate crosswalk and stop
  rather than adding optional fields.
- Receipts become ceremonial: require schema version, stage, repo SHAs,
  evidence fingerprints, blockers, decision, and verified rollback result.

## Non-goals

The first rollout is not:

- a general ontology editor;
- a world-package execution runtime;
- a full possible-world epistemic reasoner;
- a general theorem prover;
- a mandatory RDF database;
- a replacement for authored knowledge pages;
- a player-facing canon browser;
- an automatic path for LLM output to become accepted truth.

LLM extraction may create a **candidate statement with provenance**. Only the
authorized admission path can make it canonical.
