---
description: Use when the user needs to assess whether a LiveOps change is ready to launch, including rollout, monitoring, rollback, ownership, and regional verification.
---

# LiveOps readiness

Treat launch readiness as an operational claim that needs evidence, not as a
summary-writing exercise.

When reviewing a LiveOps change:

1. Identify the intended player-visible outcome and the regions or cohorts in
   scope.
2. Check preflight configuration, ownership, timing, dependencies, and the
   synthetic path a player would take.
3. Check monitoring signals, alert thresholds, and who is expected to respond.
4. Check rollback authority, last-known-good state, data repair or
   reconciliation, and closeout requirements.
5. Separate confirmed evidence from assumptions and open decisions.
6. Prefer a short readiness verdict with concrete blockers and next actions.

Use the application's available context and tools. Do not invent neighboring
document text, production telemetry, approvals, or successful tests that were
not supplied.
