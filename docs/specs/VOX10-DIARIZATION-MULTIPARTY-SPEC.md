# VOX.10 — Diarization: multi-party voice (speaker-labeled STT)

Roadmap: VOX.10. Status: build AXIS 1 (speaker-labeled transcription) only.
AXIS 2 (multiple agents in a room) is a separate epic — do NOT start it.

## Goal (this task = Axis 1)

Turn the STT feed from anonymous text into speaker-attributed turns: each
transcribed utterance carries WHO spoke, so the transcript and the agent can
attribute and address by speaker.

## Build

- Study `apps/web/src/lib/agent-transcribe.server.ts` (the STT route: multipart
  audio → POST {baseURL}/audio/transcriptions → {text}) and
  `packages/runtime-env/src/voice.ts` (provider resolution).
- Extend the transcription contract to OPTIONALLY carry diarization:
  - Request: an optional `diarize` flag (and any provider params the resolved
    STT provider needs for it).
  - Response: when diarized, `segments: [{ speaker, text, start, end }]` in
    addition to the flat `text`. When not, today's `{text}` unchanged.
- CAPABILITY CHECK is the crux: plain Whisper does NOT diarize. Determine from
  the provider config whether diarization is available (a `diarization`
  capability flag on the resolved STT provider, defaulting false). When the
  provider can't diarize, the route returns flat text and a
  `diarization: "unavailable"` marker — NEVER fabricate speaker labels. Test
  both branches against fake providers.
- A pure `mergeDiarizedSegments(segments)` helper that groups consecutive
  same-speaker segments into turns (for a readable transcript). Unit-test it
  off a fixture, no hardcoded counts.
- SECURITY INVARIANT, test-locked: diarization is NOT authentication. A
  recognized/assigned speaker label is advisory attribution and MUST NOT be
  treated as a verified principal or grant any scope. Add a doc-comment and a
  test asserting a speaker label never flows into an authz decision (the
  transcribe path has no authz today — assert the segment type carries no
  principal/scope field and the helper never emits one).

## STOP — do NOT attempt

- AXIS 2 (multiple agents audible in one session, turn arbitration, peer
  routing) — that leans on the VOX.6 coordinator which is still gated. Out of
  scope; do not touch coordinator or claude-comms.
- Any multi-party transcript UI / speaker-color rendering is taste-bearing →
  leave the typed `segments` shape and a note; Claude builds the view.
- Do NOT install a diarization model (pyannote etc.) or GPU stack. Build
  against the provider contract with fakes; whether a diarizing provider is
  deployed is David's call. If you start fetching models, STOP and report.

## Verify

`pnpm vitest run` on your files + typecheck. Report: files, test counts, the
extended transcribe contract, the capability-branch tests, the
not-authentication test, and where you stopped.
