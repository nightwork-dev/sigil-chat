# Handoff spec: `@gonk/voice-realtime` — realtime voice + hardened codex operator as Gonk capabilities

Status: spec for handoff. Roadmap: VOX.8. Audience: whoever builds the Gonk
plugin (Gonk-internals knowledge assumed). This lifts the realtime-voice
capability that was proven in an application into the Gonk capability family so
any Gonk host gets it from config, with no app-specific code.

## Why

An application proved, live, that OpenAI Codex can hold a realtime voice session
on a ChatGPT subscription (no API key) and that a voice agent can delegate to
granted tools with its built-in exec disabled. That work currently lives inside
one app's runtime. Gonk already owns the OpenAI-compatible voice substrate
(`@gonk/voice-tts@0.5.0`, `@gonk/voice-stt`) — but not the realtime transport,
the exec-hardening, or the coordinator-delegation pattern, and its voice
defaults are Apple-Silicon-bound. Encapsulate all of it as Gonk capabilities.

The DONOR implementation to port from (reference, not literal copy — Gonk should
own spawn/lifecycle/config the Gonk way): the application's
`realtime-appserver.ts` (the NDJSON JSON-RPC client), `realtime-voice.ts`
(the hardened per-session launch + host), `coordinator-mcp/*` (the delegate
surface + `launch-config` hardening), and `runtime-env/voice.ts` (the portable
provider profiles). Evidence scripts: `docs/specs/evidence/realtime-*.mjs`,
`coordinator-tool-*.mjs`.

## Verified facts (do not re-derive — these are measured/source-verified)

- Codex realtime over WebRTC works on subscription OAuth (no API key) IF the
  request uses `version: "v3"` (Frameless Bidi). The default dialect (v1) is
  backend-denied with `403 Voice session access denied` — a dialect default,
  not an entitlement wall.
- Requires **codex ≥ 0.146.0-alpha** (0.144/0.145 reject `"v3"` at params
  validation). Available as `@openai/codex@alpha` on npm.
- The wire flow over `codex app-server` (JSON-RPC 2.0 / NDJSON on stdio, or
  `--listen <url>` for remote): `initialize` (capabilities.experimentalApi=true,
  do NOT set requestAttestation) → `thread/start` → `thread/realtime/start`
  `{ threadId, outputModality:"audio", version:"v3", transport:{ type:"webrtc",
  sdp:<browser offer> } }` → notification `thread/realtime/sdp` returns the
  answer SDP. Audio flows browser ↔ OpenAI directly; the app-server only signals.
  Do NOT set an explicit session `model` with v3 (backend rejects it).
- The realtime model will NOT cede the turn (no turn_detection/create_response
  knob on realtime start; WebSocket transport needs an API key; transcription-
  only is refused for WebRTC). So a voice agent reaches tools by DELEGATION:
  give the app-server an MCP surface (`mcp_servers`), and the model hands off to
  the backend which runs a normal turn WITH those tools, streaming results back
  to speech. Proven with a per-run sentinel.
- Built-in exec can be FULLY disabled (source-verified in codex-rs): `[features]
  shell_tool = false` removes shell/unified_exec/write_stdin for BOTH the
  realtime and the delegated turn; `sandbox_mode="read-only"` +
  `approval_policy="never"` closes the residual `apply_patch` write path at
  safety-check time. Run in a per-session isolated `CODEX_HOME` with only the
  MCP servers you grant.

## Deliverables (the plugin)

### 1. `@gonk/voice-realtime` — the realtime app-server client capability
- Spawn/drive `codex app-server` (stdio and `--listen` remote), NDJSON framing
  (partial-chunk safe), request/response correlation, notification fan-out.
- Public surface: `start(offerSdp, opts) -> { threadId, answerSdp }`, `stop`,
  `appendText`, `appendSpeech`, a raw notification subscription, `dispose`
  (abortable — kill child, reject pending, clear timers).
- Binary path via `scope.get()` config (default `codex`; docs require
  ≥0.146-alpha; deployments pin `@openai/codex@alpha`). Encode the v3 +
  outputModality:"audio" + webrtc invariants; never set a session model.

### 2. Session exec-hardening helper/capability
- Materialize a per-session isolated `CODEX_HOME` with a `config.toml`:
  `[features] shell_tool=false`, `sandbox_mode="read-only"`,
  `approval_policy="never"`, and exactly the granted MCP servers.
- Hardening must be UNCONDITIONAL (do not fall back to an ambient/default launch
  when scope/grant resolution fails — that fail-open was the one real security
  bug found in the donor). Sweep stale isolated homes on startup; dispose on
  session end.

### 3. Coordinator-delegation projection
- Project selected Gonk capabilities into the realtime session as its MCP tool
  surface (Gonk already projects capabilities into MCP — this is dogfood). Keep
  the surface TIGHT (the ~32s realtime startup window punishes a fat tool set;
  the ~50-tool default `~/.codex` load blew it — an isolated home fixes that).
- Map the v3 handoff channels (analysis/commentary/final) onto Gonk's
  progress/receipt model. Every delegated action carries the authorizing grant
  id (receipt).

### 4. Portability fix (upstream Gonk)
- Gonk's voice defaults are Apple-Silicon-bound (`mlx-community/*` on oMLX
  :1243, mlx-audio :10650). Add the PROFILE pattern: `server` (OpenAI-compatible
  CPU/ONNX defaults) vs `local-mac` (MLX), with a startup guard that rejects an
  MLX model or Apple-only port under the server profile. Every field overridable
  so local-on-server vs a remote endpoint is config, not code.

## Constraints to document as capability docs

- v1 dialect denied; must pass v3. codex ≥ 0.146-alpha. No session model with v3.
- The app-server sideband control websocket resets ~40s into a session
  (transcripts stop) — front-load round-trips; flag as an upstream ticket before
  any transcript-dependent feature relies on that channel.
- ~32s realtime startup window — keep the granted MCP surface tight.

## Open problems (carry, do not pretend solved)

- **Turn ownership is impossible** on this transport — design for delegation,
  never "my agent owns the turn."
- **Credential fence** — a delegated tool that must call the HOST's own
  authenticated backend needs a short-lived credential the MCP subprocess can't
  mint. Provide a minimal, auditable bearer-issuance seam (never hand the
  subprocess a long-lived secret). This is the main unsolved production item.

## Home, publish, acceptance

- Home: the `gonk-extensions` capabilities family. Publish via the established
  `publish-core.mjs` / local-registry flow (pnpm, resolved `workspace:`/
  `catalog:` — never npm). Keep the donor app consuming its own copy until this
  ships, then repoint under consumer pull (do not hold the app hostage to the
  port).
- Acceptance: from Gonk config alone (no app-specific code) a host can (a)
  establish a realtime voice call over WebRTC on a subscription, (b) expose a
  granted Gonk capability that the voice agent delegates to and speaks the
  result of, and (c) confirm the session has NO shell/file/command authority —
  each proven by a test, and a live end-to-end check against the real binary.
