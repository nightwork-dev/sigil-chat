# VOX.11 — Realtime knowledge / ontology graph: extraction + bidirectional sync

Roadmap: VOX.11. Status: build the EXTRACTION + SYNC engine (pure/testable).
The graph VISUALIZATION is taste-bearing → stop at that boundary.

## Goal (this task = the engine, not the canvas)

As a conversation proceeds, maintain a live knowledge graph — entities,
relations, claims — derived turn by turn, that the user can correct, with
corrections flowing back into the agent's working state. Build the delta
extraction and the bidirectional-sync reducer; the rendering surface already
exists and is Claude's to wire.

## Substrate (study first — do not reinvent)

- `packages/graph/` (@workspace/graph — reducer graph engine: nodes, sockets,
  data-kinds, document, builtins) and `packages/graph-store/`. The graph
  DOCUMENT model and reducer pattern are your target data structures — express
  the ontology as this graph type, do not invent a parallel one.
- The domain-outcome reconciliation loop (search `agent-domain-outcomes` in
  apps/web/src/lib) — the established pattern for agent-writes → UI-reconciles →
  user-edits → agent-reads. Model sync on this, not a bespoke channel.

## Build

1. A pure `extractGraphDelta(priorGraph, turn)` that proposes additive/edited
   graph deltas (new entities, relations, claims) from one conversation turn.
   The LLM-extraction call is INJECTABLE (pass an extractor fn); tests use a
   fake extractor returning fixed deltas. The function is pure: prior graph +
   turn + extractor → proposed delta, no I/O of its own.
2. A pure reducer `applyGraphDelta(graph, delta)` producing the next graph,
   expressed on the @workspace/graph document type. Deterministic; unit-tested
   off fixtures (no hardcoded counts — derive from the fixture).
3. BIDIRECTIONAL SYNC is the whole point: a user edit is AUTHORITATIVE and
   corrects the agent's working state, not just the view. Build
   `reconcileUserEdit(graph, edit)` and, crucially, the projection that feeds
   the corrected graph back so it changes the agent's NEXT act. Test the
   behavioral consequence (retrieval-is-not-use): a scenario where the agent's
   next extraction/answer differs BECAUSE a prior claim was user-corrected vs
   not — A/B it, assert the difference.
4. Stable identity: entities/relations get stable ids so re-extraction updates
   rather than duplicates; layout positions (when the canvas exists) can stay
   put. Test that re-extracting an already-known entity updates, not dupes.

## STOP — do NOT attempt

- The graph CANVAS / visualization / live layout is taste-bearing UI → Claude
  builds it on ReducerStudio (demos.studio). Leave the graph document type, the
  reducers, and a one-paragraph integration note. Do NOT write React canvas
  code.
- Do NOT wire a real LLM extraction prompt as the default — ship the injectable
  seam with a fake; the real prompt is a tuning task with Claude.

## Verify

`pnpm vitest run` on your files + typecheck. Report: files, test counts, the
graph document type you chose (and why it fits @workspace/graph), the
A/B behavioral-consequence test for bidirectional sync, and where you stopped
at the canvas boundary.
