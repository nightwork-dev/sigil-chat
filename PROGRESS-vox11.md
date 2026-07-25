# VOX.11 progress

Implemented the extraction and bidirectional-sync engine and stopped at the
canvas boundary.

## Files created

- `packages/graph/src/ontology.ts` — injectable `extractGraphDelta`, pure
  `applyGraphDelta`, authoritative `reconcileUserEdit`, corrected-working-state
  projection, stable IDs, and ontology reducer definitions.
- `packages/graph/src/ontology.fixture.ts` — conversation turn, proposed delta,
  and empty graph fixtures.
- `packages/graph/src/ontology.test.ts` — extraction, reducer-document,
  stable-identity, A/B sync-consequence, authority, and structural-edge tests.
- `PROGRESS-vox11.md` — this handoff.

## Verification

- `pnpm vitest run src/ontology.test.ts` from `packages/graph`: 1 test file,
  6 tests passed.
- `pnpm typecheck` from `packages/graph`: passed (`tsc --noEmit`).
- The root frozen install was attempted first as required, but npm returns 404
  for locked `@zigil/agent-eve@0.1.7`. The graph package was therefore installed
  and verified in isolation from its own public dev dependencies; this did not
  require changing a manifest or lockfile.

## Graph document choice

The engine produces `ReducerGraphDocument`, the native document type from
`@workspace/graph`. Entities, relations, and claims are reducer nodes so each
resource can retain editable semantic input values and a stable node ID;
ordinary `ReducerEdgeDocument` edges connect entity `reference` outputs to the
`subject` and `object` inputs of relations and claims. The supplied ontology
reducers make the document valid under the existing registry/materialization
rules. Existing positions survive re-extraction, while new nodes deliberately
start at `{ x: 0, y: 0 }` because layout belongs to the future canvas.

## Bidirectional behavioral consequence

The A/B test begins with the same extracted claim that Atlas launches Friday.
Branch A projects that graph into the next fake extractor call and produces an
answer containing Friday. Branch B first applies an authoritative user edit to
Monday, projects the corrected working state into the same fake extractor, and
produces an answer containing Monday. The test asserts that the next proposed
act differs, proving use rather than mere retrieval. Separate assertions prove
that later extraction cannot overwrite the user-authored claim or redirect the
structural edge of a user-authored relation.

## Canvas boundary

Stopped after the pure `ReducerGraphDocument` engine, ontology reducers, stable
identity, extractor seam, sync reducer, and tests. No React, route, hook,
ReducerStudio wiring, canvas, visualization, live layout, or real LLM prompt was
written. Canvas integration should read the document directly, persist user
semantic edits through `reconcileUserEdit`, and pass the resulting document
back to the next `extractGraphDelta` call; agent-originated persistence can use
the established domain-outcome invalidation loop when that UI work is built.
