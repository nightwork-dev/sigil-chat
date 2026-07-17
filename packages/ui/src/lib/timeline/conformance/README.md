# Conformance corpus

The normative test set required by SCHEDULE-SPEC-v2.md §12. Every engine
implementation must pass every fixture. `runner.test.ts` discovers all
`fixtures/**/*.json` and executes them by `kind`.

## Fixture format

```jsonc
{
  "kind": "resolve | validate | compress | trim | instances | feasibility",
  "spec": "§6",                    // the governing spec section — REQUIRED
  "description": "what this fixture proves, incl. hand-computed derivation",
  "tree": { /* Schedule; serialization sugar allowed (runner normalizes) */ },
  "currentValues": { "wallClock": 1150 },   // keys: wallClock | turnCount | gameTick | narrativeTime:<worldId> | custom:<domain>
  "op": { /* kind-specific, see below */ },
  "expect": { /* kind-specific, see below */ }
}
```

Per kind:

- **resolve** — `expect.nodes`: map of nodeId → subset of ResolvedSchedule
  fields to assert (only listed fields are checked; listed nodes must exist).
- **validate** — `expect.errors`: array of `{ code, nodeIds }`; compared as a
  set, count must match exactly (message text is not compared).
- **compress** — `op: { nodeId, targetSpan }`. Success:
  `expect: { ok: true, durations: {id: newBasis}, offsets: {id: newBasis} }`.
  Failure: `expect: { ok: false, deficit, blockers: [ids] }`.
- **trim** — `op: { nodeId, grid: {unit, mode, origin?}, policy }`; the runner
  trims, re-resolves, then checks `expect.nodes` as in resolve.
- **feasibility** — `op: { nodeId }`;
  `expect: { minimalWindow?: n, maximalWindow?: n | null }`.
- **instances** — `op: { rangeStart, rangeEnd, overrides?: { "id:index": OccurrenceOverride } }`;
  `expect.instances`: ordered array of per-instance field subsets
  (`occurrenceIndex`, `resolvedStart`, `resolvedEnd`, `isModified`, `cancelled`).

## Conventions (binding for fixtures AND engine)

- Numbers are plain scalars in the tree's time context. wallClock defaults to
  **unix seconds** (spec §10 examples do); fixtures that declare
  `timeContext.unit: "milliseconds"` use unix milliseconds.
- Calendar semantics are **UTC-only** for the corpus: `hourly`/`daily`/`weekly`
  step by fixed 3600/86400/604800 seconds × interval, scaled into the
  declared wallClock unit, from the base start; `daysOfWeek` filters by the
  UTC weekday of the occurrence start; `monthly` steps by UTC calendar months.
  No local timezones anywhere (spec §8 leaves timezone grids to consumers; the
  corpus pins UTC so implementations agree).
- Expected values are derived BY HAND from the spec text — never by running the
  engine and pasting its output. A fixture that disagrees with the engine is
  adjudicated against the spec, and whichever is wrong gets fixed.
