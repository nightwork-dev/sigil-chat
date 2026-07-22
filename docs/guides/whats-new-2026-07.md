# What changed in July 2026

This is the plain-language guide to the current development slice. It explains
what now works in the product, what changed underneath it, and what still needs
a visible UI or deployment proof.

## The five-minute version

Imagine Sigil Chat as a shared office where people and agents work together.
This release improves five parts of that office:

1. **Projects and workspaces have real locks.** An agent cannot merely name a
   project and gain access. Membership is checked, registry changes use
   revision checks, and project/workspace changes tell the open browser to
   refresh.
2. **Agent edits show up promptly.** When an agent changes a blackboard, the
   browser receives a precise `blackboard.changed` outcome and refreshes the
   affected blackboard. The old 15-second poll remains only as a safety net.
3. **Memory has privacy tests, not just a database.** Tests now prove that
   irrelevant prompts do not receive unrelated memories, a different
   principal cannot receive someone else's memory, and per-turn recall does
   not mutate the cache-stable prompt prefix.
4. **Requests can become durable work.** Humans and agents now share one
   request-intake substrate for proposing a feature/tool/workflow need,
   searching for duplicates, inspecting it, and adding evidence. Scope checks
   prevent one workspace from reading another workspace's requests.
5. **External clients have a secure MCP foundation.** The web app exposes an
   authenticated `/api/mcp` gateway backed by user-owned API keys and explicit
   resource/tool grants. Creating, replacing, or revoking a key requires a
   one-time password-verified step-up receipt.

The `/status` surface and Eve healthcheck also report useful, secret-free
readiness details instead of only saying red or green.

## What this means for a user

- Project and workspace membership is enforced when tools read or mutate
  container data.
- Concurrent container edits fail with a revision conflict instead of silently
  overwriting each other.
- An agent-written blackboard update can appear immediately in an open view.
- A remembered fact can be recalled in a later session without being exposed
  to a different authenticated principal.
- A feature or tool request can retain its requester, scope, evidence, and
  duplicate history instead of becoming an untraceable chat promise.
- A CLI or another MCP client can eventually use a narrowly scoped user key
  without receiving the deployment-wide internal `GONK_MCP_KEY`.
- Operators can distinguish model-login problems from Eve runtime failures and
  see sanitized diagnostics for the web, Eve, and Gonk services.

## Technical map

| Capability                        | Main implementation                                                                                    | Important boundary                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Container authorization           | `apps/gonk/src/registry/containers.ts`, app-owned registries and scope authorization                   | Registry membership and live grants authorize access; scope names do not.                               |
| Live container/blackboard refresh | `apps/web/src/lib/agent-domain-outcomes.tsx`                                                           | Outcomes reconcile React Query state; they do not grant authority.                                      |
| Memory verification               | `apps/agent/agent/lib/memory.test.ts`                                                                  | Recall is audience-scoped and delivered with the turn; semantic/vector retrieval remains separate work. |
| Request intake                    | `packages/work-items-store`, `apps/gonk/src/registry/request.ts`, `apps/web/src/lib/request-intake.ts` | Search, inspect, and evidence writes are scope-filtered; unknown and denied records fail opaquely.      |
| External MCP gateway              | `apps/web/src/routes/api/mcp.ts`, `apps/web/src/lib/external-mcp.server.ts`                            | Public keys are user credentials with explicit grants; `GONK_MCP_KEY` stays internal.                   |
| Readiness diagnostics             | `apps/web/src/lib/system-status.server.ts`, `apps/agent/scripts/healthcheck.mjs`                       | Diagnostics are sanitized and model-aware; HTTP availability alone is not readiness.                    |

## What is not finished

- Request intake has server functions, tools, persistence, and reconciliation,
  but still needs its inbox/detail/form UI, duplicate-candidate interaction,
  triage/promotion UI, and browser-owner review.
- External MCP still needs the Settings > Security key-management UI and a
  real deployed remote-client smoke. Its in-memory rate/session counters need
  shared storage before a multi-instance deployment.
- Memory episode provenance is preserved when supplied, but Eve does not yet
  expose the complete episode-finished capture seam. Semantic/vector recall is
  tracked separately.
- Project/workspace homes and scoped boards still have owner-facing review
  gates. Passing package tests is not the same as proving the visible product.
- Per-agent tool surfacing is deferred because that work may belong in the
  released `@zigil/agent-*` packages rather than this app.

## Security model in one paragraph

There are three different credentials. A normal web session identifies a
human using the browser. A user-owned external MCP API key identifies that same
human to `/api/mcp`, but only with the key's explicit resource and tool grants.
The deployment-wide `GONK_MCP_KEY` authenticates traffic between Sigil's own
services. These credentials are not interchangeable, and every real operation
must re-check its current resource authorization before side effects.
