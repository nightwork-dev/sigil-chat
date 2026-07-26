# Codex realtime delegation facts (2026-07-26)

Companion to `CODEX-BINARY-FACTS-20260726.md`. Written after reviewing another
agent's explanation of tool delegation via the codex app-server: that
explanation was **substantially correct**, with three cautions it (and any
future agent) must carry. Verdicts below are grounded in the vendored source
(`/Users/dr/Dev/vendor/codex`, main @ `61a4488`) and live measured runs
(`docs/specs/evidence/coordinator-tool-gate.mjs`), not inference.

## The delegation mechanism (source-verified, live-proven)

The realtime voice model never receives the MCP tool inventory directly. Its
tool path is a HANDOFF back to the owning codex session:

```
voice model emits handoff
  -> RealtimeEvent::HandoffRequested
  -> Session::route_realtime_text_input(text)      (core session/mod.rs)
  -> Op::UserInput   — a NORMAL codex session turn,
                       WITH the session's configured MCP servers
  -> result streams back via send_conversation_function_call_output
  -> the realtime model SPEAKS the result itself
```

Consequences, all confirmed:

- **TRUE: "the voice agent effectively has the session's capabilities, by
  delegation."** The delegated turn runs with the same MCP servers,
  permissions, and conversation as the codex thread.
- **TRUE: "it feels like the voice agent used the tool."** Live gate: the
  full round-trip (voice request -> delegated MCP tool -> spoken result)
  completed at +25.6s and was voiced natively.
- **TRUE: no browser-TTS layer is needed for delegated results.** The
  realtime model voices them. (An agent that concluded it needed to route
  results through browser TTS was wrong and has retracted it.)
- **TRUE: a separate subagent is optional at the protocol level.** The
  handoff targets the codex thread itself. Sigil's VOX.6.1 coordinator
  routes delegation onward to Eve via a granted MCP server — that is a
  product choice (the one-agent contract), not a protocol requirement.

## The three cautions

### 1. v2 is an unproven dialect here — build against v3

An agent was seen inspecting `RealtimeSessionKind::V2` handoff events. The
handoff machinery is shared, but our live subscription-OAuth verdicts are:
**v1 backend-denied, v3 works, v2 never live-tested by us.** Always pass
`version: "v3"` explicitly (also insulates against upstream PR #17188
flipping the WebRTC default). If someone needs v2, they run the evidence
matrix first (positive control, then the probe) — they do not assume.

### 2. "Same permissions" is a hazard unless the session is hardened

The delegated turn inherits the codex session's config. That is exactly why
it is dangerous on an ambient `~/.codex`: "the voice agent can use the
tools" would include shell exec. Every session we launch uses an isolated
`CODEX_HOME` with `shell_tool = false`, `sandbox_mode = "read-only"`,
`approval_policy = "never"`, and ONLY granted MCP servers (grant failure =>
hardened + toolless, never ambient). Mutation-locked in @gonk/voice-realtime
tests. Any new consumer of this delegation path MUST launch through that
hardening, not a bare `codex app-server`.

### 3. Two measured constraints you cannot design past

- **The ~32-40s window.** The app-server sideband resets; the delegated
  round-trip must complete inside it. Front-load the request; keep the
  granted MCP list tight; no long preambles.
- **The voice model owns the turn.** When it resumes speaking, it cannot be
  muted or made to cede the turn to another agent (P2 gate FAILED, measured;
  OpenAI's own shipped turn-taking confirms it). Do not re-attempt
  "voice model as a silent mouthpiece" — the working architecture is the
  voice model as a COORDINATOR that delegates and voices results.

## Channel labels — one subtlety

The BEM channel prefixes (`[THINKING]`/`[PROGRESS]`/`[DONE]`) are consumed
INSIDE codex; they do not surface as wire tags. The delegation edge
(`handoff_request`) and per-utterance transcript/done events ARE visible to
the app-server client, so "is delegating" vs "final answer" is
distinguishable. For explicit machine-readable labels the lever is
`codexResponsesAsItems=true` + `codexResponseItemPrefix` (source-identified,
not yet live-run).

## What this means for new work

The "correct immediate goal" pattern — voice coordinator delegates to an
MCP-enabled codex thread, receives the completed result, resumes speaking —
is ALREADY IMPLEMENTED as Sigil's VOX.6.1 coordinator (branch
`vox-verify`/`vox6-coordinator`, security-reviewed, pending owner live
verify). Before building a parallel implementation of this pattern anywhere
else, read that code and `docs/specs/LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md`
(gate verdicts + build direction), and reuse the hardened-launch +
grant-projection substrate from `@gonk/voice-realtime`.
