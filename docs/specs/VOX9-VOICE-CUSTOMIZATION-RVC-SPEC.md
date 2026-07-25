# VOX.9 — Voice customization: RVC pipeline + per-persona voice identity

Roadmap: VOX.9. Status: build the PLUMBING; stop at hardware + UI boundaries.

## Goal

A persona's voice is a customizable, owned identity, not a provider default.
Two independent layers — build layer 1's seam and layer 2's data model; do
NOT attempt to install or run RVC models (hardware-dependent — see STOP).

## Layer 1 — RVC as a post-synthesis pipeline stage

TTS produces audio; an optional RVC (retrieval-based voice conversion) stage
re-timbres it to a chosen voice. It sits BEHIND the existing provider seam so
it is configuration, never app code.

- Study `packages/runtime-env/src/voice.ts` (readVoiceEnvironment: the
  profile/provider resolution) and `apps/web/src/lib/agent-voice.server.ts`
  (the synth call: POST {baseURL}/audio/speech → audio bytes).
- Add an OPTIONAL conversion stage to the resolved voice config: a
  `conversion` block (enabled?, endpoint baseURL, model/voice-id, format) that,
  when present, pipes the TTS audio bytes through
  `POST {conversion.baseURL}/convert` (an OpenAI-ish audio-in/audio-out shape —
  define the request/response contract in the spec header comment) and returns
  the converted bytes. When absent, behavior is byte-identical to today.
- The stage MUST be injectable and mockable: the tests pass a fake converter,
  assert (a) absent config → original bytes unchanged, (b) present config →
  converter called with the TTS bytes and its output returned, (c) converter
  failure DEGRADES to the original TTS audio (never breaks speech — mirror the
  degrade-to-text discipline in agent-voice.ts), (d) no credential/endpoint
  leaks into any error.
- Wire the stage into BOTH consumers: the reply-speech path
  (agent-voice.server.ts) and the synthesize-speech tool
  (packages/agent-tools/src/speech-provider.ts). One shared conversion helper,
  not two copies.

## Layer 2 — voice as a persona attribute

- Voice/style/speed become persona-scoped settings. Find how a persona carries
  presentation today (agent profile / fixtures) and add a `voice` attribute
  (provider voice id + optional conversion config + speed).
- The reply-speech path and the synth tool read the persona's voice as the
  default when the caller doesn't override. Test: persona A and persona B
  resolve different voice configs; an explicit per-call voice still wins.

## STOP — do NOT attempt (flag for the human / Claude)

- Do NOT install, download, or run RVC model weights or a GPU/MLX inference
  stack. The conversion endpoint is an EXTERNAL contract you build against with
  a fake; whether a real RVC server exists on this hardware is David's call. If
  you find yourself installing torch/rvc/onnx or fetching multi-GB weights,
  STOP and report — that is the hardware risk flagged in the brief.
- Do NOT build voice-cloning UPLOAD/TRAINING UX, and do NOT enable arbitrary
  voice cloning: that needs an identity-safety/consent gate that is a separate
  taste + policy decision. Leave a clear extension point and stop.
- Any persona-settings UI (the voice picker) is taste-bearing → leave a typed
  seam and a one-paragraph note; Claude builds the control.

## Verify

`pnpm vitest run` on your new/changed test files + repo typecheck. Report:
files, test counts, the conversion request/response contract you defined, the
falsification runs (degrade-on-converter-failure especially), and exactly
where you stopped at the hardware and UI boundaries.
