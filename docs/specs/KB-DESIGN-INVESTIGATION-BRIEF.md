# Investigation brief — the right way to do knowledgebases in Sigil Chat

> For: codex (read-only investigation → design recommendation)
> Author: Vesper, 2026-07-20
> Deliverable: a design document at `docs/specs/KB-DESIGN-RECOMMENDATION.md`
> Baseline to challenge: `docs/specs/PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md` §4–6
> Stories: `sigil-roadmap` KB.1 / KB.2 / KB.3 (current, provisional)

## What this is and isn't

This is **not** an implementation brief. Do not write feature code. The
knowledgebase shape in the existing spec was ratified quickly and the owner
wants it interrogated before we build. Your job is to find the *right*
architecture — confirm the spec where it's right, and say clearly (with
evidence) where it's wrong — then hand back a design doc a builder can execute.

The owner's one-line framing, verbatim: *"give agents persistent memories
beyond an individual user — teach the agent things and give them a place to
persist things."* Knowledge attaches to **containers** (project / workspace),
not to a single conversation, so a thing taught once holds for every session
and every member of that container.

## Ground rules (these are load-bearing — violations invalidate the report)

1. **Cite files by `path:line`.** Every claim about how something works today
   must point at the code. No "it probably does X."
2. **Probe libraries at the resolved version.** `@gonk/memory`, `@gonk/embedding`,
   `@gonk/eve-host`, `@mirk/*` — a comment or README asserting behavior is a
   claim, not evidence. Read the installed `dist`/types and, where it matters,
   write a ten-line probe. State the version you inspected.
3. **Retrieval is not use.** A capability that's wired but never reached-for is
   inert. For every retrieval path you propose, answer: *what makes the agent
   consult the KB at the right moment, and how would we A/B that it changed the
   next action* — not just that it appeared in context.
4. **Upstream vs app-side is a real boundary.** Sigil Chat consumes
   `Mirk ← Gonk`; it must not fork gonk contracts app-side. Where the right
   answer needs a `@gonk/memory` / `@gonk/eve-host` / `@gonk/embedding` change,
   say so explicitly and mark it upstream — do not design an app-side shim
   around a missing seam.
5. **Recommend, don't survey.** Every open question below must end in a pick
   with a one-paragraph rationale and the losing option's cost. Distinguish
   "confident" from "needs a prototype to decide."

## The substrate you're designing against (verify each)

- **Storage:** Mirk (`@mirk/*`) — KV, collections, vectors, search, content
  addressing, lineage. The current owner of all generic data primitives.
- **Memory:** `@gonk/memory` + `@gonk/eve-host` already ship — per-(principal,
  persona) *relationship* memory, automatic per-turn recall, FTS5 + sqlite-vec
  (vector side currently inert; see EMB.1). This is the closest working
  precedent for "persistent index, incremental on write, budget-checked recall."
  Read how it indexes session transcripts and how recall is gated
  (`contextFitsBudget`) before proposing anything for the KB.
- **Embedding:** `@gonk/embedding` (OpenAI-compat) exists; EMB.1 is wiring it.
  The KB's vector half rides EMB.1; the FTS half stands alone.
- **Evidence:** `sigil-evidence-ask` already answers questions over scope
  artifacts. The spec wants the KB to become a first-class corpus here.
- **Retrieval contributor:** a dormant `sigil.retrieval` contributor is the
  intended per-turn injection slot (spec §5). Find it, confirm it's real, and
  determine what activating it actually costs.
- **Scope:** `apps/gonk/src/artifact-scope.ts` tiers are now
  `session / workspace / project / persona` (PROJ.1 just landed the workspace
  tier and registries). Tier is *location, not authorization*; authz is
  membership + HMAC scope proofs. KB read/write must respect that.

## The questions to answer (each ends in a recommendation)

### Q1 — Document & storage model
The spec says: markdown + frontmatter `{id, scope, title, tags, authoredBy,
revision, sourceRef?}`, stored via Mirk, content-addressed history. Interrogate:
is content-addressed history the right versioning for editable knowledge (vs a
mutable record + revision counter)? How do edits and deletes propagate to the
index without orphaning chunks? Is markdown-doc the right grain, or should the
indexed unit be a chunk from the start? Recommend the document model and the
edit/delete→index contract.

### Q2 — Chunking & indexing
Reuse `@gonk/memory`'s transcript-index substrate for the KB, or a dedicated
index? What chunking (whole-doc, heading-section, sliding-window) fits authored
knowledge vs chat transcripts? Define the incremental-update mechanics on
write/delete and the embedding granularity. Name what's upstream.

### Q3 — Retrieval integration (the crux)
Three surfaces are on the table: (a) automatic per-turn recall via
`sigil.retrieval`, budget-checked like memory; (b) explicit `sigil-knowledge-search`;
(c) KB as a corpus inside `sigil-evidence-ask`. These are not mutually
exclusive but naively doing all three triple-injects and blows the budget.
Design the *combined* retrieval story: when each fires, how they dedupe against
each other and against relationship-memory recall and artifact evidence, and —
per ground rule 3 — what makes the agent actually consult authored knowledge at
the right moment rather than continuing by habit. This is where the spec is
thinnest; spend the most here.

### Q4 — KB vs memory boundary
Relationship memory (organic, private, per-principal) vs authored KB (taught,
member-visible, editable). Where does the "teach in conversation → distill to a
doc" flow land, and does the distill machinery that already produces structured
artifacts actually fit? Critically: for *"the agent remembers X for the whole
project,"* is the right substrate a KB doc (auditable, editable, member-visible)
or an extension of `@gonk/memory` audiences to scope-audiences (spec §6, KB.3)?
Pick the primary substrate and justify it; the spec leans KB-first but wants
this validated, not assumed.

### Q5 — Scope, ownership, resolution
KB attaches to a container across the tier chain (session → workspace → project
→ persona → global). Define resolution/precedence order for recall, cross-tier
visibility, and read/write membership gating — consistent with PROJ.1's proof +
membership model (note: PROJ.1's *mutation* surface has accepted authz gaps;
don't design the KB to depend on guarantees the registry doesn't yet enforce —
see the PROJ.1 "Known issues" note).

### Q6 — Prior art (bounded)
Briefly (not a literature dump): how do mature systems handle agent knowledge —
Claude Projects knowledge, Cursor/Windsurf rules+docs, retrieval frameworks
(LlamaIndex/LangChain agentic-RAG), static-context vs retrieval tradeoffs,
context-budget discipline. Extract only what changes a decision above; cite what
we should adopt or deliberately reject and why.

## Deliverable shape

Write `docs/specs/KB-DESIGN-RECOMMENDATION.md`:
1. **Verdict** — confirm/revise the spec's KB shape in 5–8 bullets, each
   tagged `[confirm]` / `[revise]` / `[reject]`.
2. **The recommended design** — document model, index, retrieval story, KB/
   memory boundary, scope semantics. File-anchored to what exists.
3. **Upstream vs app-side split** — an explicit list of required `@gonk/*`
   contract changes vs what Sigil Chat owns.
4. **Open risks / prototype-to-decide** — the calls you can't make from reading
   alone, with the smallest experiment that would settle each.
5. **Revised KB.1/KB.2/KB.3** — updated acceptance criteria if the shape moved.

Keep it decision-dense. The owner reads for the picks and the reasons, not the
tour.
