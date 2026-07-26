# Spec: bearer-issuance seam — the coordinator credential fence (VOX.6.2)

Status: design spec, ready to build. Roadmap: VOX.6.2 (unblocks production
delegation). Audience: whoever builds the coordinator's production auth path.
Grounded in the live code as of 2026-07-25 — every claim below is checked
against the named file, not inferred.

## The fence (measured, not assumed)

Every turn the coordinator submits to Eve goes through the ONE seam text chat
uses — `apps/agent/agent/lib/coordinator-mcp/eve-delegate-port.ts` — carrying
the same proofs a text turn carries:

- **session binding** — `issueAgentSessionBinding(payload, bindingSecret)`
- **scope delegation** — `issueScopeDelegation({scope, subject}, bindingSecret)`
- **persona header**
- **bearer** — passed as `auth: { bearer: context.bearer }` **only when present**

The first three the coordinator subprocess mints itself: it holds
`SIGIL_AGENT_BINDING_SECRET` (the internal web↔Eve handoff secret) and both
`issue*` helpers are HMACs over that secret. The **bearer is different**: Eve's
channel auth (`eve-auth.ts`) verifies a **web-signed EdDSA JWT**, and only the
web server holds that signing key. The subprocess cannot mint it.

Today (VOX.6.1): the bearer is injected at launch if the web server had one to
hand over. Absent it, the delegate turn authenticates ONLY where Eve accepts
local-dev auth (`SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH`, David's local live-verify). A
production deployment with no injected bearer — or a call that outlives the
token's TTL — is **refused by Eve at the door**. That refusal is the entire
gap between "works in David's dev loop" and "my voice agent runs my team in
production." Nothing else on the coordinator path is blocked.

## Why launch-injection is not enough

1. **TTL.** The EdDSA bearer is short-lived by design. A realtime voice session
   can hold the coordinator open far longer than one token lifetime; a long
   delegation (or a second delegation minutes later) presents an expired bearer
   and is refused mid-conversation.
2. **No bearer at launch in production.** The coordinator MCP is spawned inside
   Eve's process tree. In dev the web server can seed one bearer. In a real
   deployment there may be no live web principal at spawn time to mint the
   first bearer from — the session is driven by the voice user, who authed to
   the *web*, not to the Eve subprocess.

Both need the same thing: a way for the subprocess to obtain a **fresh**
short-lived bearer **on demand**, without ever holding the EdDSA signing key.

## The seam

A minimal internal issuance endpoint on the **web server** (the only bearer
minter), authenticated by the proof the subprocess CAN produce — the session
binding — never by a bearer (no refresh-token chaining).

### Endpoint

`POST {SIGIL_PUBLIC_URL}/internal/agent/bearer`  (internal network boundary
only; same trust surface as the existing web→Eve binding route, never reachable
from the browser or from a codex MCP tool)

Request headers (all minted by the subprocess from `bindingSecret`, exactly as
`mintHeaders` already does):
- `x-sigil-session-binding: <issueAgentSessionBinding(...)>`
- `x-sigil-scope: session:<applicationThreadId>`
- `x-sigil-scope-proof: <issueScopeDelegation(...)>`
- `x-sigil-persona-id: <personaId>`

Response: `{ bearer: string, expiresAt: number }` — a freshly EdDSA-signed
bearer for **exactly** the principal and scope carried by the verified binding.

### The web server's obligations (the security core)

1. **Verify the binding proof** with the same verifier the web→Eve binding
   route uses (`SIGIL_AGENT_BINDING_SECRET`). Reject on bad/expired signature.
2. **Re-derive** `subject` (principal) and `scope` **from the verified binding
   payload — never from any caller-supplied claim.** The subprocess cannot
   widen its own identity or scope: the binding it can mint already fixes both
   (it is signed over `subject`, `homeScopeId`, `applicationThreadId`).
3. **Re-check liveness/revocation**: the bound session/thread still exists and
   the authorizing grant (the coordinator's `delegate_to_eve` grant, and in
   VOX.6.2 the peer/record grants) is still live. A revoked session or grant →
   `403`. This is the kill switch: revoke the grant, refresh stops, the voice
   agent loses reach within one TTL.
4. **Mint a short-lived bearer** for that principal/scope (same lifetime policy
   as the web-issued bearer; issue short-lived, never a long-lived token).
5. **Audit** every issuance: `{ sessionId, subject, scope, grantId, issuedAt,
   expiresAt }` → the durable receipt store (see "Receipts" below).

### The subprocess side

- On launch: if no bearer was injected, call the seam once before the first
  delegation.
- Cache the bearer; refresh when within a small window of `expiresAt`, OR
  reactively on a `401` from Eve (belt-and-suspenders — clock skew).
- Never persist the bearer beyond the process; never log it; it stays in the
  narrow `context.bearer` slot `createEveDelegatePort` already reads.
- If the seam returns `403` (revoked), the subprocess surfaces "no longer
  authorized" as spoken degradation — it does NOT retry or fall back to
  local-dev auth in production.

## Invariants (must hold; each is testable)

- **Binding proof is the root, not the bearer.** Issuance never accepts a
  bearer as its own credential → no expired/stolen bearer can bootstrap a new
  one. Test: a request with a valid bearer but INVALID binding is refused.
- **No widening.** Principal and scope come from the verified binding only.
  Test: a binding for principal A + scope S, with body/headers claiming
  principal B or scope S′, yields a bearer for A/S (or a refusal), never B/S′.
- **Revocation within one TTL.** Test: revoke the grant, the next refresh
  `403`s, and the in-flight bearer expires without renewal.
- **Short TTL preserved.** Test: `expiresAt - issuedAt <= configured max`; the
  seam cannot mint a long-lived token.
- **Internal-only.** Test: a browser-origin / cross-origin request is rejected
  (reuse `rejectCrossOrigin` + the internal-network guard the binding route
  uses); the endpoint is absent from the OpenAPI/public route surface.
- **Exec-hardening untouched.** This adds a network call, not local authority;
  `shell_tool=false` + read-only sandbox + single-MCP-server are unchanged.

## Receipts (VOX.6.2 also owes this)

VOX.6.1 left the authorizing-grant receipt at stderr. Give it a real home:
every bearer issuance AND every delegated action records `{ grantId, sessionId,
subject, scope, action, at }` to a durable audit surface (the blackboard /
work-items store is the natural fit — it is already the coordinator's write
target for `record_request`). One audit record type covers issuance,
delegation, peer message, and record — so "what did the voice agent do on my
behalf, under which grant" is answerable after the fact.

## What this deliberately does NOT do

- It does not hand the subprocess the EdDSA signing key (that would collapse the
  fence — the whole point is the subprocess can prove *binding* but not *sign
  bearers*).
- It does not use OpenAI's remote-MCP auth model (where the Realtime API holds
  MCP credentials): that path executes tools on OpenAI's side and would move our
  credential boundary off our infrastructure. Our tools run in our app-server
  MCP; auth stays ours.
- It does not add a long-lived service credential. Every token is short-lived
  and re-minted against a live, revocable binding.

## Build order

1. Web: `POST /internal/agent/bearer` — verify binding, re-derive identity,
   liveness check, mint, audit. (Mirror `agent-thread-bindings.server.ts` for
   the verify + guard; reuse the existing EdDSA minter.)
2. Subprocess: bearer cache + refresh (pre-expiry + reactive-on-401) in
   `eve-delegate-port.ts` / `context.ts`; no bearer in logs.
3. Receipts: one audit record type; write on issuance + every delegated action.
4. Tests: the six invariants above, each red-on-removal.
5. Live gate (David): production-style run (no local-dev auth) proves a
   delegation that outlives one TTL succeeds via refresh, and that revoking the
   grant kills reach within one TTL.

## Dependency note

Sequence after VOX.6.1's owner live-verify (confirms the delegate path end to
end). This seam is the prerequisite for BOTH remaining VOX.6.2 capabilities
(`message_peer`, `record_request`) reaching production — they authenticate the
same way. It is the spine of the coordinator's production readiness.
