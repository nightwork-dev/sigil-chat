# Codex binary facts — realtime voice edition (2026-07-26)

Written to unconfuse agents about which codex binary does what. Every claim
here is verified against the npm registry, the vendored source
(`/Users/dr/Dev/vendor/codex`, main @ `61a4488`, 2026-07-26), or a live run —
not blog posts. If you are about to re-derive any of this, don't; if you think
one of these facts is stale, re-verify against those sources and update THIS
file.

## The version landscape (checked 2026-07-26)

| Binary | Version | Where | Realtime v3? |
| --- | --- | --- | --- |
| Installed CLI (`codex --version`) | 0.144.6 | `npm i -g @openai/codex` (stale) | **NO — below threshold** |
| npm `latest` | 0.145.0 | `@openai/codex` | NO |
| npm `alpha` | **0.146.0-alpha.10.1** | `npm i -g @openai/codex@alpha` | **YES** |
| ChatGPT.app embedded | 0.146.0-alpha.3.1 | inside the desktop app bundle | YES (this ran the original proof) |

The realtime `v3` dialect needs **codex >= 0.146.0-alpha**. There is exactly
one common confusion, so state it plainly:

> **You do NOT need ChatGPT.app.** The realtime-capable binary installs
> standalone from npm (`@openai/codex@alpha`). The original v3 proof
> (2026-07-25) happened to run against ChatGPT.app's embedded binary only
> because it was the binary with a live login at proof time. That was never a
> constraint — treating it as one was a recorded framing error, corrected
> 2026-07-26 (see LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md, final section).

Residual that IS real: v3 backend behavior was proven live on alpha.3.1 and
has not been re-run on alpha.10.1. API shape is stable in source; one
live-verify run against the current alpha closes this before any deploy pins
`@alpha`.

## What realtime v3 actually is

- `codex app-server` (JSON-RPC over stdio or `--listen <ws-url>`) exposes
  `thread/realtime/start`. Pass `version: "v3"`, `outputModality: "audio"`,
  transport `{type:"webrtc", sdp:<browser offer>}`, and **never a session
  model**. The answer SDP arrives via the `thread/realtime/sdp` notification.
- The infamous `403 "Voice session access denied"` was **not an entitlement
  wall** — it was the v1 dialect default being denied. v3 works on plain
  subscription OAuth, no API key. Evidence scripts:
  `docs/specs/evidence/realtime-*.mjs`.
- Pass `version:"v3"` explicitly always: upstream PR #17188 flips the WebRTC
  default dialect, and an explicit version insulates you from it.
- Audio flows browser <-> OpenAI directly over WebRTC. The app-server only
  signals; no credential reaches our server or the browser.
- Dead ends, do not revisit: re-implementing codex's subscription WebRTC
  client outside codex (403s — attestation), and muting the realtime model so
  another agent answers in its place (P2 gate FAILED, measured; their own
  shipped turn-taking confirms the model cannot cede the turn). The working
  architecture is the voice model as a COORDINATOR that delegates via MCP.

## Auth facts (this is where agents get confused)

- **Codex auth was always portable.** The subscription login lives in
  `~/.codex` (`auth.json` / `.credentials.json`). Copy those files and the
  binary is authenticated — Eve deployments already run codex remotely this
  way, and `@gonk/voice-realtime`'s hardened launch copies `auth.json` into
  its isolated `CODEX_HOME` by design.
- `codex login --device-auth` is the GUI-free login path for servers — a
  convenience, not an unlock.
- Remote app-server (`codex app-server --listen`) supports
  `--ws-shared-secret-file` bearer auth (`codex-rs/cli/src/main.rs:4098`) plus
  `/readyz` / `/healthz` probes and a `-32001` overload error. A remote
  app-server is deployable as an authenticated service. Any deployment of the
  `listen-url` path MUST use the shared secret + probes AND must start the
  remote process against the hardened `CODEX_HOME` the capability hands it —
  otherwise the exec-hardening does not apply (see @gonk/voice-realtime
  README, "Remote (--listen)").

## Hardening facts (per-session, non-negotiable)

Every realtime session we launch runs an **isolated temp `CODEX_HOME`** with:
`shell_tool = false`, `sandbox_mode = "read-only"`, `approval_policy =
"never"`, and ONLY granted MCP servers (grant/scope failure => same hardened
config with zero servers, never ambient `~/.codex`). Verified against codex
source; mutation-locked in `@gonk/voice-realtime` tests.

## Known operational constraints

- ~32-40s: the app-server sideband websocket resets; front-load round-trips.
  Delegated tool round-trips must finish inside the window.
- Realtime startup window is roughly 32s — keep the granted MCP list tight.
- Long sessions: transcript echo loops (codex issue #12902) can burn usage;
  partially mitigated since codex 0.121.
- Realtime requires a paid ChatGPT plan; API-key-only setups cannot use it.

## Where the deep records live

- `docs/specs/LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md` — the full
  assessment, gate verdicts, and the 2026-07-26 verified-facts appendix.
- `docs/specs/GONK-REALTIME-VOICE-PLUGIN-HANDOFF.md` — the VOX.8 port brief.
- `docs/specs/evidence/` — runnable evidence scripts (positive-control first).
- Roadmap: `VOX.0` (epic anchor + standing risks), `VOX.8` (Gonk port status).
