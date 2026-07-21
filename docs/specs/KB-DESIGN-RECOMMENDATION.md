# Knowledgebase design recommendation

> Date: 2026-07-20
>
> Baseline: `PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md`, especially KB.1–KB.3
>
> Verdict: **[revise]**
>
> Scope: design recommendation only; no feature implementation

The center of the current design is right: shared project knowledge should be an
authored, inspectable corpus, not a widened form of private relationship memory.
The weak point is the retrieval architecture around it. The current spec assumes
an integration seam that does not exist in the dev worktree, conflates two
different `@gonk/memory` surfaces, and settles too early on storage mechanics
without specifying the document lifecycle, retrieval packet, or evaluation gate.

---

## CORRECTION — adopt the existing Gonk knowledge vertical, do not rebuild it (David, 2026-07-20)

**This supersedes the "build" spine below.** The verdict and design that follow
were written without recognizing that **Gonk already owns a complete authored-
knowing vertical.** They design app-side documents, a hybrid FTS+dense index,
and a first-class typed-relations graph — most of which already exists upstream,
and two of which contradict the platform owner's deliberate choices (Gonk's
knowledge surface uses **keyword FTS with no embeddings** — "keyword precision
beats semantic fuzz for knowledge" — and the triples graph is already shipped,
not something Sigil should re-implement). Treat everything from `## Verdict`
onward as *reference analysis of the retrieval problem*, not as the plan.

### What Gonk already provides (verified 2026-07-20)

- **`@gonk/knowledge`** — durable authored **pages** with `category`/`tags`/
  `[[wiki-links]]`+backlinks, FTS5 keyword query (no embeddings by design),
  supersession-with-provenance (corrected, not overwritten;
  `includeSuperseded` audit), a `private`/`personal`/`team` visibility split
  mapped onto scope tiers, threat-scanned writes (`scanMemoryContent`), and
  **threshold-gated passive selection** (`selectKnowledgeForInjection`, per-
  persona `injectionThreshold`). Tools: `knowledge_write` / `knowledge_query` /
  `knowledge_get` / `knowledge_links`.
  (`platform/gonk/gonk-extensions/packages/capabilities/knowledge/README.md`)
- **Temporal triples graph** — `@gonk/memory`'s `TriplesLayer`: assert / query /
  invalidate, confidence, provenance, `invalidatesPriors` supersession, and
  point-in-time (`as-of` epoch-ms) lookup. Exposed as `triple_assert` /
  `triple_query` / `triple_invalidate` via **`@gonk/memory-tools`** (`tripleTools`).
  Knowledge composes with it — hosts wire `knowledgeTools()` + `tripleTools()`
  onto one `ctx.host`.
- **Automatic harvesting** — the **reflector** runs scheduled harvest over
  completed transcripts and may call `memory_store` / `triple_assert`
  (`reflector/src/harvest.ts`, `pi-reflector`).

### What is actually missing (the real work)

1. **Sigil composes none of it.** Neither `apps/agent` nor `apps/gonk` depends on
   `@gonk/knowledge`, `@gonk/memory-tools`, or a reflector adapter; `TriplesLayer`
   is exported but never constructed; the Eve compiler registers only skills.
2. **The passive-injection host hook is unwired upstream too** — `@gonk/knowledge`
   ships pure selection/formatting but explicitly defers the concrete
   `session_start`/turn-boundary hook to a host adapter (`@gonk/pi-knowledge`)
   that does not exist.
3. **Project/workspace authorization + visibility for knowledge is not defined**
   anywhere yet.

### Corrected recommendation (the plan of record)

1. **Adopt `@gonk/knowledge` + `@gonk/memory-tools` (`TripleStore`) upstream
   contracts.** Do not build app-side documents, nodes, relations, or graph
   storage. Do not add an embeddings index to the knowledge corpus — respect the
   keyword-first design.
2. **Add project/workspace authorization + visibility semantics *upstream*** (in
   the knowledge/scope contracts), not forked app-side. This is gonk-home-turf
   contract work, coordinated like the EMB.1 / `@gonk/eve-host` seam — it must
   not become a Sigil-local scheme.
3. **Build the missing Eve adapter** — the `@gonk/pi-knowledge`-equivalent host
   hook — that combines knowledge selection, triple query/traversal, and context
   receipts into the per-turn context, and activates a real authorized retrieval
   contributor (the currently-dormant `sigil.retrieval` slot). Register the
   reflector adapter so harvesting runs on Sigil transcripts.
4. **Keep Sigil responsible only for**: container policy (which knowledge belongs
   to which project/workspace), the ratification/teach UI, Evidence Room
   composition (knowledge as a first-class corpus in `sigil-evidence-ask`), and
   product evaluation.

The KB.1–KB.3 acceptance criteria in this doc and in the roadmap are being
rewritten to this spine. Anything below that says "build a document model,"
"hybrid FTS+dense," or "typed-relations index" is the pre-correction analysis,
retained only for the retrieval reasoning it contains.

## Verdict

- **[confirm]** Keep the member-visible knowledgebase as the primary shared
  substrate. Relationship memory is persona-owned and relationship-audienced in
  the installed contract (`apps/agent/node_modules/@gonk/memory/dist/types-CvPpCE5U.d.ts:114-169`),
  and Sigil writes that audience explicitly (`apps/agent/agent/lib/memory.ts:147-167`).
  A project fact should not acquire the privacy, opacity, or lifecycle semantics
  of relationship memory.
- **[revise]** Make a stable logical document the unit of authorship and an
  immutable revision the unit of provenance. A content digest identifies one
  revision; it must not be the document's mutable identity. Markdown remains the
  canonical human-readable source, while chunks, embeddings, graph edges, and
  summaries are disposable projections.
- **[revise]** Use a dedicated knowledge index rather than reusing the session
  transcript schema. The installed transcript layer can append turns and perform
  FTS/vector recall with reciprocal-rank fusion
  (`apps/agent/node_modules/@gonk/memory/dist/types-CvPpCE5U.d.ts:325-424`), but
  Sigil's live per-turn memory path is `EveMemoryHost.automaticRecallForTurn`
  (`apps/agent/agent/channels/eve.ts:29-43`), whose receipt explicitly reports
  `lexical-index` (`apps/agent/node_modules/@gonk/eve-host/dist/guard.d.ts:184-209`).
  Reuse the retrieval pattern, not the transcript record model.
- **[reject]** Do not describe KB.2 as “register the dormant
  `sigil.retrieval` contributor.” The default compiler registers only the skills
  contributor (`apps/agent/agent/lib/sigil-context.ts:264-290`), and the dev test
  deliberately proves that requesting `sigil.retrieval` yields
  `contributor-failed` (`apps/agent/agent/lib/sigil-context.test.ts:39-68`). A
  real authorized retrieval source and contributor must be built.
- **[revise]** Define one retrieval coordinator and one evidence-packet contract
  shared by automatic turn context, `sigil-knowledge-search`, and
  `sigil-evidence-ask`. Today evidence search rebuilds an in-memory BM25 corpus on
  every call (`apps/gonk/src/registry/evidence.ts:159-218`) and uses fixed
  character passages (`apps/gonk/src/registry/evidence.ts:276-347`). Adding two
  more independent searches would produce divergent ranking, citations, and
  authorization behavior.
- **[confirm]** Persistent lexical plus dense retrieval is the right text
  foundation, but complete it: heading-aware contextual chunks, BM25 and dense candidate
  generation, reciprocal-rank fusion, a reranking seam, parent/neighbor
  expansion, source resolution, and structured selection receipts. This is the
  strongest practical baseline across ordinary technical and product knowledge;
  it is not merely “put embeddings beside FTS.”
- **[revise]** Make typed relations a first-class KB.1 index and retrieval voice,
  not a deferred sidecar. Relational questions are a normal Sigil use case, so
  the default should be a layered hybrid of authored text, explicit nodes and
  relations, lexical/dense retrieval, and bounded graph traversal. Still reject
  a heavyweight formal ontology or LLM-extracted GraphRAG index as the canonical
  source: those add schema governance, extraction uncertainty, community
  recomputation, and deletion complexity that explicit member-visible relations
  do not require.
- **[revise]** Reuse the current distill card interaction, references, and
  reconciliation event—not its storage schema. `sigil-distill` persists a fixed
  question/summary/resolution JSON artifact and only adds a blackboard pointer
  for session scope (`apps/gonk/src/registry/distill.ts:12-27`,
  `apps/gonk/src/registry/distill.ts:72-123`). “Teach this project” should instead
  create a reviewable draft knowledge document with stable identity, scope,
  provenance, and an explicit ratification transition.

## What current RAG evidence says

There is no single state-of-the-art retriever independent of corpus and question
type. The useful synthesis is a routing decision:

| Need | Recommended retrieval shape |
| --- | --- |
| Exact identifiers, decisions, procedures, local facts | Contextual BM25 + dense retrieval, rank fusion, rerank |
| A section whose wording is ambiguous outside its document | Heading/document context on the indexed chunk; return the source section |
| Complex question with weak first-pass hits | Bounded query rewrite or decomposition, retrieval, relevance grading, one retry |
| Text plus explicit relational constraints | Hybrid text and graph retriever |
| Themes or implications across a very large corpus | Graph/community or breadth-aware global retrieval |
| Small, stable, always-needed operating rules | Pinned context, not RAG |

The strongest general baseline is contextual hybrid retrieval. Anthropic's
[Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
experiments combine contextualized chunks, BM25, embeddings, rank fusion, and a
reranker; their reported gains are vendor experiments rather than a universal
leaderboard, but the architecture addresses the exact failure modes of authored
project documents: lost headings, exact technical terms, and semantically related
paraphrases.

Agentic RAG is best treated as a bounded recovery path, not the only retrieval
path. The current [LangGraph agentic RAG
pattern](https://docs.langchain.com/oss/python/langgraph/agentic-rag) decides
whether to retrieve, grades retrieved documents, and rewrites a poor query. For
Sigil, ordinary automatic recall should remain deterministic and cheap; query
decomposition or a second retrieval pass belongs behind low-confidence or
explicit research/evidence requests. It should not add an LLM decision before
every basic knowledge lookup.

“Graph” names several distinct mechanisms that should not be conflated:

- Microsoft's [GraphRAG paper](https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/)
  targets global sensemaking over roughly million-token corpora using an
  LLM-derived entity graph and community summaries. That is GraphRAG, not a
  formal domain ontology.
- [LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/)
  distinguishes local fact questions, where vector-style best-first retrieval is
  strong, from global questions requiring corpus breadth; it also demonstrates
  the value of deferring expensive model work until query time.
- Graph maintenance is not free. [GraphRAG
  1.0](https://www.microsoft.com/en-us/research/blog/moving-to-graphrag-1-0-streamlining-ergonomics-for-developers-and-users/)
  added incremental ingestion because evolving data previously required full
  reindexing, and new content can still alter community structure enough to
  recompute much of the index.
- [HybGRAG](https://aclanthology.org/2025.acl-long.43/) reports strong gains on
  questions that genuinely combine text and relations. [OG-RAG](https://aclanthology.org/2025.emnlp-main.1674/)
  reports gains from a domain ontology and hypergraph on specialized factual
  tasks. Both support keeping a graph/ontology route available; neither shows
  that ontology construction is the right default for an evolving general
  project KB.

Accordingly, the recommendation is a **layered hybrid from KB.1**: authored text
plus first-class member-visible nodes and typed relation assertions. Start with a
small governed predicate vocabulary such as `references`, `supersedes`,
`dependsOn`, `implements`, `ownedBy`, `partOf`, and `about`, while allowing
project-defined predicates with explicit namespace and version. Index those
assertions in Mirk's edge store and use them in the normal retrieval plan. Mirk
already supplies directed typed edges and bounded traversal
(`apps/gonk/node_modules/@mirk/store/dist/graph.d.ts:3-30`,
`apps/gonk/node_modules/@mirk/store/dist/graph.d.ts:53-93`), but that is a graph
primitive—not entity linking, ontology governance, reasoning, community
summarization, or a graph ranker. KB.1 therefore also needs lightweight node
identity, alias resolution, relation provenance, and hybrid ranking. Do not add
automatic accepted triple extraction, OWL-style reasoning, or community
summarization in KB.1.

## Recommended design

### 1. Canonical document and revision model

Use explicit lifecycle records for documents, revisions, nodes, and relations:

```ts
interface KnowledgeDocumentHead {
  id: string
  scope: { tier: "workspace" | "project"; id: string }
  title: string
  slug: string
  tags: string[]
  status: "draft" | "ratified" | "archived"
  currentRevision: number
  indexedRevision?: number
  authoredBy: string
  updatedBy: string
  sourceRefs: KnowledgeSourceRef[]
  links: KnowledgeLink[]
  chunkManifest: string[]
  createdAt: string
  updatedAt: string
}

interface KnowledgeDocumentRevision {
  docId: string
  revision: number
  contentDigest: string
  markdown: string
  metadataSnapshot: KnowledgeDocumentHeadMetadata
  createdAt: string
  createdBy: string
}

interface KnowledgeNode {
  id: string
  scope: { tier: "workspace" | "project"; id: string }
  kind: string
  label: string
  aliases: string[]
  description?: string
  sourceRefs: KnowledgeSourceRef[]
  status: "draft" | "ratified" | "archived"
  revision: number
}

interface KnowledgeRelation {
  id: string
  scope: { tier: "workspace" | "project"; id: string }
  subject: { kind: string; id: string }
  predicate: string
  object: { kind: string; id: string }
  evidenceRefs: KnowledgeSourceRef[]
  authoredBy: string
  status: "draft" | "ratified" | "archived"
  revision: number
}
```

The write API requires `expectedRevision`. An update writes an immutable pending
revision, deterministically rebuilds that document's lexical/vector projections,
then compare-and-swaps the head to the new `currentRevision` and
`indexedRevision`. Search resolves every candidate through the live head and
rejects archived documents or a chunk whose revision does not equal
`indexedRevision`. This makes a partial indexing failure invisible to readers
and safely retryable. Store each revision's chunk manifest so removed or renamed
sections can be purged idempotently.

Document links are authoring sugar over canonical `KnowledgeRelation` records,
so incoming and outgoing relations are queryable without scanning documents.
Nodes may represent documents or named project resources; aliases are explicit
and reviewable rather than silently inferred. Relation predicates are identifiers
from a versioned registry, not free-form prose at query time. A relation is an
assertion with its own lifecycle and evidence, not an edge whose truth is implied
merely by physical adjacency.

Delete means archive/tombstone plus immediate search exclusion, followed by
idempotent removal of lexical rows, vectors, and graph projections. Provenance
remains in revision history. Mirk's markdown store is a suitable authored projection—it
supports frontmatter, bodies, mutable put/remove, and optional Git history
(`packages/blackboard-store/node_modules/@mirk/store-markdown/dist/index.d.ts:19-77`)—but
the KB repository must own CAS, revision state, and index publication semantics.

### 2. Chunk and index model

Chunk Markdown by semantic structure, not by a blind character window:

1. Parse frontmatter and heading hierarchy.
2. Make each leaf section the initial retrieval unit; split only oversized
   sections on paragraph/list/code boundaries.
3. Use a deterministic chunk identity such as
   `docId#heading-anchor:part`, with document revision stored as metadata. Do not
   put the revision in the logical chunk ID; reindexing the same section replaces
   it, while the manifest removes disappeared sections.
4. Index a contextual form containing project/workspace name, document title,
   heading path, tags, and the section text. Preserve the unmodified source text
   and line/heading locator for citation.
5. Resolve node labels and aliases from the query, then run bounded graph
   traversal for explicit relational constraints and one- or two-hop expansion
   from high-confidence text candidates.
6. Generate BM25, dense, and graph candidates independently; normalize graph
   results into evidence packets, fuse/deduplicate by canonical resource,
   optionally rerank the fused shortlist, then expand selected results with
   their source section and relation evidence when the token budget allows.

The installed primitives are sufficient for the first storage layer: Mirk search
supports replace/remove semantics (`apps/gonk/node_modules/@mirk/store/dist/search.d.ts:6-14`)
and its vector store supports upsert/remove/search
(`apps/gonk/node_modules/@mirk/store/dist/vector.d.ts:24-40`). Narrow runtime
probes against the installed packages confirmed replacement by stable chunk ID,
vector lookup, edge traversal, and deletion from both indexes. The remaining
work is the coordinating repository, not another database abstraction.

Store the embedding provider/model, dimensions, contextualizer version, chunker
version, and source revision on every index generation. A changed fingerprint
invalidates the affected projection and triggers a rebuild; it must never mix
incompatible vectors silently.

### 3. One retrieval coordinator, three consumers

Define an authorized request and a common result:

```ts
interface RetrievalRequest {
  principalId: string
  activeScope: { tier: "workspace" | "project"; id: string }
  query: string
  corpora: Array<"knowledge-text" | "knowledge-graph" | "artifacts">
  purpose: "turn-context" | "search-tool" | "evidence-answer"
  tokenBudget?: number
}

interface EvidencePacket {
  resourceRef: string
  scope: { tier: "workspace" | "project" | "session"; id: string }
  revision: string
  title: string
  locator: { heading?: string; startLine?: number; endLine?: number }
  quote: string
  scores: { lexical?: number; dense?: number; fused: number; reranked?: number }
  relationPath?: Array<{ subject: string; predicate: string; object: string }>
  provenance: KnowledgeSourceRef[]
}
```

- **Automatic turn context** runs the cheap text-and-graph hybrid pass for each
  substantive user turn. Text retrieval anchors named resources and concepts;
  detected relational constraints select predicate, direction, and depth, with a
  conservative depth cap and fan-out budget. It contributes a budgeted set of
  packets to the latest turn, marked as
  untrusted reference material. It does not put retrieved text in the system
  prompt and does not treat a document as executable instruction unless that
  document is explicitly typed and authorized as a pinned instruction.
- **`sigil-knowledge-search`** exposes deliberate discovery over the same
  coordinator and returns the same packets and citations. It does not cause a
  second hidden context injection.
- **`sigil-evidence-ask`** requests both knowledge and artifact corpora, then
  synthesizes only from the returned packets. Its exact-quote/no-evidence
  behavior is worth preserving (`apps/gonk/src/registry/evidence.ts:233-273`),
  but its index and passage implementation should disappear behind the shared
  coordinator.

Within a turn, cache by normalized query, authorized scope chain, corpora, graph
plan, and index generation. Dedupe on `resourceRef`. Produce a receipt containing
sources queried, resolved nodes/aliases, traversed predicates and paths,
candidate IDs, ranking voices, selected/dropped packets, token use,
scope/revision, latency, and retry decisions. This prevents automatic recall,
tool search, and evidence synthesis from independently injecting the same text
or concealing an unbounded graph walk.

The context compiler also needs one shared budget scheduler. Today relationship
recall is appended only if the whole candidate still fits, compiled context is
then appended, and blackboard content is tried afterward
(`apps/agent/agent/lib/sigil-context.ts:96-167`). Adding KB retrieval as another
append-if-it-fits block would make source order determine recall. Instead, keep
the identity floor fixed, then rank budgetable candidates from pinned
instructions, direct user selections, ratified KB packets, relationship recall,
and blackboard content with source-specific minimums/caps and explicit drop
receipts. Relationship memory remains a separate authorized source and never
becomes project-visible.

### 4. Scope, ownership, and conflict rules

KB.1 should support **project** and **workspace** knowledge only. Session content
remains an artifact/blackboard concern; persona knowledge remains relationship
memory or a separately authored persona resource. There is no global resource
tier in the current scope contract (`apps/gonk/src/artifact-scope.ts:8-14`), so
“+ persona, global” must not be smuggled into the first resolution chain.

For a workspace-bound turn, authorize and search the active workspace and its
parent project. Writes always name exactly one container. Do not apply a generic
“nearest tier wins” rule: two documents may disagree without being versions of
one another. A workspace document shadows a project document only through an
explicit `overrideOf`/`supersedes` link (or the same deliberate override key);
otherwise return both with scope and revision provenance and let the agent expose
the conflict.

Every read and write must re-check the trusted principal against current project
membership. Write additionally requires an owner/editor role. Scope tier is only
location, not authorization (`apps/gonk/src/artifact-scope.ts:32-35`). This is a
hard gate because current container mutation is not yet an adequate precedent:
legacy missing registry records remain possession-gated
(`apps/agent/agent/lib/scope-authorization.ts:46-82`), project upsert is an
unconditional replacement rather than CAS (`apps/agent/agent/lib/project-registry.ts:76-84`),
and the Gonk project-upsert handler does not inspect tool auth
(`apps/gonk/src/registry/containers.ts:82-105`). KB writes must not ship as
multi-user-safe until those ownership and mutation gaps are closed or the KB
repository independently enforces the stricter contract.

### 5. Teaching and ratification

“Remember this for the workspace/project” produces a **draft**, never silent
shared truth. The draft contains the proposed Markdown, source turn/artifact
references, target scope, author, and any detected conflict with ratified
documents. The existing card interaction can render it. Ratification performs an
authorized CAS transition to `ratified`; correction creates a new revision;
rejection archives the draft. Only ratified documents enter automatic recall by
default, though explicit search can include drafts for authorized editors.

This is the clean boundary between conversation and durable knowledge. It also
makes malicious or mistaken source text reviewable before it becomes ambient
context.

## Upstream Gonk versus Sigil Chat

### Upstream Gonk

- A reusable authorized retrieval-source/contributor contract: discovery,
  candidate packets, source resolution, rank/fusion metadata, budget selection,
  receipts, multi-source dedupe, and typed relation-path provenance.
- The context compiler seam needed to combine retrieval candidates with other
  context sources without source-order starvation.
- Generic embedding/index fingerprints and health/fallback reporting if these
  are not already exposed by the installed embedding adapter.
- No scope-audience extension to `@gonk/memory` in KB.1–KB.2. KB.3 should retain
  that as a separately justified upstream change only if authored knowledge
  cannot satisfy a demonstrated shared-memory need.

### Sigil Chat

- Knowledge document/revision, node, relation, and predicate repositories;
  Markdown projection; CAS lifecycle; indexing coordinator; and repair/rebuild
  commands.
- Project/workspace resolution, current-membership authorization, role policy,
  conflict/override semantics, and prompt-injection treatment.
- Gonk tools, Knowledge workspace UI, teach/ratify cards, React Query outcomes,
  and Evidence Room integration.
- Corpus-specific chunking defaults, ranking configuration, evaluation set, and
  product telemetry.

Mirk already provides KV/Markdown, lexical, vector, and generic edge primitives.
Adding a second storage abstraction or a graph database is not justified for
KB.1. The reusable missing abstraction is the retrieval contract and its
auditable orchestration.

## Open risks and required prototypes

1. **Retrieval quality.** Build a versioned evaluation set of real Sigil tasks:
   exact identifiers, decision lookup, procedure use, cross-document conflict,
   paraphrase, multi-hop relation, and global synthesis. Measure lexical/dense
   recall@k, nDCG/MRR, citation correctness, abstention, next-action correctness,
   latency, and token cost. Answer quality alone can hide retrieval failure.
2. **Actual next-action value.** A/B the same task set with KB retrieval off and
   on. Score whether the next tool call or answer used the correct ratified
   source—not merely whether a relevant chunk appeared in top-k. This is the
   acceptance test for “the agent consults the KB when it matters.”
3. **Index crash consistency.** Fault-inject between revision write, lexical
   update, vector update, and head publication. Readers must see either the old
   complete revision or the new complete revision, never a mixed generation.
4. **Embedding degradation.** Prove FTS-only operation when the embedding service
   is absent or the model fingerprint changes. Rebuild must be observable and
   resumable.
5. **Prompt injection and stale authority.** Test retrieved prose that claims to
   be system instructions, membership revocation between index and read, and a
   deleted/superseded document returned from a stale candidate list.
6. **Graph-quality gate.** Because graph retrieval is in KB.1, label the
   evaluation questions that require explicit relations, multi-hop traversal, or
   global corpus breadth and measure text-only versus the shipped text+authored
   graph path. Require correct node resolution, path provenance, bounded fan-out,
   and a material next-action/citation improvement on the relational subset.
7. **Ontology/extraction gate.** Only after the authored graph baseline exists,
   compare it with LLM-extracted candidate relations, ontology-grounded
   retrieval, or community GraphRAG. Promote extracted relations only through
   review/ratification. Adopt a formal ontology or community index only if it
   improves the labelled relational/global subsets enough to pay for schema
   ownership, update cost, and deletion propagation.

## Revised roadmap acceptance criteria

### KB.1 — Authored knowledge graph and hybrid retrieval

- Stable logical documents, nodes, and relation assertions have
  project/workspace scope, draft/ratified/archived state, provenance, and
  immutable revisions; mutation requires `expectedRevision`.
- Relations are first-class records with subject, versioned predicate, object,
  evidence, and lifecycle. Node aliases and relation assertions are
  member-visible and correctable; document frontmatter links project to those
  records rather than forming a second graph model.
- Markdown is the canonical author surface. Search chunks and embeddings are
  reproducible projections with chunk/index/model version fingerprints.
- Heading-aware contextual chunks are indexed persistently in lexical and dense
  stores, while ratified relation assertions are indexed as typed Mirk edges.
  Retrieval combines text anchoring with bounded relation traversal, RRF/source
  dedupe, resolvable text and path citations, FTS-only fallback, and a reranking
  seam evaluated before becoming mandatory.
- Upsert, section/relation removal, node merge, alias correction,
  archive/delete, failed indexing, retry, and full rebuild are idempotent and
  pass crash-consistency tests.
- `sigil-knowledge-{list,get,upsert,archive,search}` enforce current membership,
  role-gated writes, exact target scope, CAS, and domain outcomes.
- Node/relation list, resolve, upsert, archive, and traverse tools enforce the
  same contract and return the evidence behind every relation path.
- `sigil-evidence-ask` consumes the common retrieval coordinator rather than
  rebuilding its own KB index.
- The benchmark records retrieval, citation, next-action, latency, and cost
  baselines before KB.2 automatic injection is enabled.

### KB.2 — Teaching, automatic consultation, and explicit retrieval

- Teach-in-conversation creates a provenance-linked draft card; only an
  authorized explicit ratification makes it eligible for automatic recall.
- Teach may propose nodes and relation assertions alongside the document, but
  every proposed assertion remains a separately reviewable draft.
- A real authorized knowledge retrieval source and `sigil.retrieval` contributor
  exist; acceptance must not refer to activation of a pre-existing dormant
  contributor.
- Automatic context, `sigil-knowledge-search`, and `sigil-evidence-ask` share
  evidence packets, scope resolution, ranking, cache, dedupe, citations, and
  receipts.
- Identity remains fixed; retrieved KB text is append-only latest-turn reference
  material. Retrieved prose cannot promote itself to instruction authority.
- One context budget scheduler prevents source-order starvation and records why
  every candidate was selected or dropped.
- A/B evaluation demonstrates improved next-action correctness and citation use,
  with defined latency/token ceilings and no relationship-memory disclosure.

### KB.3 — Shared memory and ontology expansion only under proven pull

- Relationship memory remains private; no project/workspace audience is added to
  `@gonk/memory` as part of KB.1 or KB.2.
- Before proposing scope-audience memory, document a real accumulation behavior
  that cannot be represented as authored, reviewable knowledge and specify its
  ownership, disclosure, correction, and deletion semantics.
- Authored typed relations are projected into Mirk's edge store and participate
  in the default hybrid recall path with explicit depth/fan-out limits and path
  provenance.
- Automatically extracted relations remain drafts until ratified; extraction
  confidence alone never makes shared project knowledge authoritative.
- A formal ontology or LLM-derived community knowledge graph requires a named schema
  owner, vocabulary/version migration policy, extraction confidence and review
  policy, provenance back to source revisions, deletion propagation, and a
  benchmark win over hybrid text plus authored links.

In plain words: build an excellent, auditable hybrid knowledge graph from the
outset—documents for what people said and meant, explicit relations for how the
work fits together. Let evidence decide whether that graph later needs automatic
extraction, formal ontology reasoning, or GraphRAG community summaries.
