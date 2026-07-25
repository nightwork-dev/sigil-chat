# VOX.6.1 — Sigil coordinator surface: the voice agent delegates to the real Eve agent

Roadmap: VOX.6 (gate PASSED — see COORDINATOR-TOOL-REACH GATE VERDICT in
LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md). This is the FIRST CUT: one
capability (`delegate_to_eve`) + the authority/receipt spine. Peer-messaging
and record-request are VOX.6.2 — do NOT build them here (tight surface is a
hard requirement, not a preference: the gate proved ~50 tools blow the ~32s
realtime window).

## What this makes true

Today the live voice call launches a codex realtime thread with
`-c mcp_servers={}` (apps/agent/agent/lib/realtime-appserver.ts,
CODEX_APP_SERVER_ARGS) — a separate agent with ambient LOCAL codex authority
and no reach into Sigil. This build replaces that with a narrow, GRANTED
Sigil coordinator surface so the voice agent is a personal COORDINATOR that
speaks on its own AND delegates real app work to the actual Eve agent
(persona, memory, tools, scope, one transcript) and voices the result.

## The mechanism (proven; do not re-derive)

The realtime frontend model issues a handoff → codex runs a normal turn WITH
the app-server's configured `mcp_servers` tools → tool output streams back and
is spoken. So: point `mcp_servers` at a Sigil coordinator MCP server exposing
`delegate_to_eve`. When the user asks the voice agent to do app work, it calls
that tool; the tool delegates into the P1-bound Eve thread and returns the
result for the model to speak.

## Build

### 1. The coordinator MCP server (stdio)
- A new stdio MCP server (in apps/agent — e.g. agent/lib/coordinator-mcp/)
  exposing exactly ONE tool this cut: `delegate_to_eve({ request: string })`.
- It receives, per session, the bound context the P1 offer route already
  reconstructs (applicationThreadId, principalId, personaId, resourceScope,
  eveSessionId — requireBoundApplicationThread in realtime-voice.ts has all of
  it and currently discards it; thread it through). The MCP server is launched
  PER live session with that context injected (env/args), never globally.
- `delegate_to_eve` sends `request` into the bound Eve application thread as a
  normal turn (reuse the SAME path text chat uses to reach Eve — study
  apps/web/src/lib/agent-session-binding.ts and how Eve turns are submitted;
  do NOT invent a second submission path) and returns Eve's user-facing reply
  text. Only user-facing reply text — apply the speakable-text discipline so
  tool args/results/reasoning from Eve's turn are NOT returned to be spoken.

### 2. Authority + receipts (the security spine)
- The coordinator acts as a DISTINCT principal `coordinator:<userId>` — use
  coordinatorPrincipalId() from apps/web/src/lib/coordinator-authority.ts (or
  its agent-side equivalent; if the module is web-only, extract the pure core
  so apps/agent can share it — do NOT fork a second copy of the rules).
- `delegate_to_eve` is authorized as a delegated capability: the coordinator
  principal must hold a narrow grant for the bound resource scope; every
  delegation RECORDS the grant id that authorized it (the receipt) and that
  receipt is observable (returned in the tool result metadata and/or logged to
  the session). No grant → the delegation is refused with a plain message the
  model can speak ("I'm not authorized to do that here").
- FALSIFICATION (test-locked, both directions): with the grant present, a
  delegation is authorized and carries a grantId; with the grant removed, the
  same delegation is refused. Mirror the coordinator-authority test rigor.

### 3. Replace the ambient-authority launch
- Swap `-c mcp_servers={}` for the coordinator MCP server config in
  CODEX_APP_SERVER_ARGS / the client start path. Keep the surface to just this
  one server/tool.
- ADDRESS THE AMBIENT-EXEC HAZARD explicitly: the assessment's core danger is
  the voice thread's raw local shell/exec authority. Determine whether codex
  app-server exposes config to DISABLE or sandbox the built-in local tools for
  this thread (check the vendored source /Users/dr/Dev/vendor/codex and
  `codex app-server` config — approval_policy, sandbox, tool enablement). The
  coordinator surface should be the agent's ONLY authority; if built-in exec
  cannot be fully disabled, document exactly what remains and flag it LOUD as a
  deployment fence. Do not silently ship a voice agent with raw exec.

## Gotchas (from the live gate — respect or it won't work)
- Keep the tool surface TIGHT: one server, one tool. Startup latency must fit
  the realtime window.
- The ~32s realtime-websocket reset still bites: the delegate round-trip must
  complete quickly. Note in the design how a slow Eve turn is handled (a
  bounded wait + a spoken "still working" is acceptable; a silent hang is not).

## STOP — leave for the human / a gate
- Do NOT build message_peer or record_request (VOX.6.2).
- The LIVE browser verification (start a call, ask the voice agent to do
  something in the app, hear it delegate to Eve and speak the real result) is
  DAVID's — end with a precise click-list. Do not drive browser automation.
- If disabling built-in exec is impossible, STOP at that finding and report —
  do not ship raw exec behind a voice call without David's explicit call.

## Verify
`pnpm vitest run` on your files + apps/agent + apps/web typecheck; iterate to
green; read real output. Report: files, test counts, the delegate path you
reused (proving you did not fork Eve submission), the authority
falsification (grant present/absent, both directions), the exact
built-in-exec disposition (disabled? sandboxed? residual?), and the click-list.
