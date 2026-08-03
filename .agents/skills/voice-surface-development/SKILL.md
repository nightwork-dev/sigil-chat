---
name: voice-surface-development
description: Use when adding a voice-adjacent surface (dictation, live call, voice-conversation mode), debugging "mic not released", or considering unifying the three voice controls into one. Covers the three separate state machines, the single capture-release owner, and the never-auto-send default.
---

# Voice surface development

The voice/realtime subsystem lives upstream in `@zigil/agent/voice`
(client-safe: the three state machines, capture-lifecycle, dictation-outcome,
audio-focus, speech-playback, speakable-text, the TTS/STT clients, the
realtime-voice negotiation engine, and the React hooks that compose them) and
`@zigil/agent/voice/server` (the codex realtime app-server client). Import
from those subpaths — do not recreate copies under `apps/web/src/lib`. What
stays in this repo is product policy wired around that surface: the TTS/STT
server routes (`agent-voice.server.ts`, `agent-transcribe.server.ts` — auth,
persona resolution, and the deployment-specific runtime-env voice profile),
the realtime offer-exchange authorization (`voice-realtime.server.ts`, and
its browser-side TanStack server-fn wrapper `voice-realtime.ts`), and the
Eve-side realtime route (`apps/agent/agent/lib/realtime-voice.ts`).

Three composer controls touch the microphone: dictation
(`voice-control-state`), a live voice call (`voice-live-state`), and
voice-conversation mode (`voice-conversation-state`) — all three exported
from `@zigil/agent/voice`. Each is a separate, pure state machine — no DOM,
no React, no fetch — and that separation is a design decision, not an
oversight.

## Three machines because three different promises

- **Dictation** (`idle → requesting-microphone → listening → transcribing →
  idle`, plus `error`) captures an utterance and hands back editable text.
- **Live voice** (`idle → connecting → live`, plus `error`) opens a duplex
  channel to a **separate, capability-limited voice agent** — it does not
  share this thread's persona, memory, or tools. `voice-live-state.ts`'s own
  comment is explicit that the "experimental, separate voice agent" wording
  in its `idle` label is a capability disclosure, not hedging, and may only
  be dropped when that binding actually changes.
- **Voice conversation** (`off`/`on`, binary, no motion vocabulary, no error
  state) is the real Eve agent — same persona, memory, tools, approvals, and
  transcript as typing — reached by talking one turn at a time.

Folding a sixth state into `voice-control-state` would make one control mean
two things, and "am I dictating or am I on a call?" is exactly the ambiguity
that must never exist. When you're tempted to unify two of these into one
richer machine, that temptation is the anti-pattern this separation exists
to prevent — a third control on the same composer row needs its own state
module, sized to its own promise, not a case added to a sibling's.

Each machine is still a **total function**: an event that makes no sense in
the current state leaves the state alone rather than inventing a transition,
and the "stop" event (`cancel`/`stop`) is accepted from every state — the
structural expression of "no state traps the user in capture."

## `capture-lifecycle.ts` is the single owner of hardware release

Browsers do not release a live microphone track just because a component
unmounted or a promise rejected — an abandoned `MediaStreamTrack` keeps the
mic indicator lit and the device held open. `createCaptureLifecycle` is the
one place that promises every track is stopped and every `AudioContext` is
closed, on **every exit path alike**: `stop()` (normal end), `error()`
(upload failure, device error), and `dispose()` (unmount/teardown) all route
through the same `release()`, which runs at most once even if multiple exit
paths fire.

If you are debugging "mic not released" or "device stays held open after
navigating away," the bug is that some exit path bypassed
`createCaptureLifecycle` and called browser APIs directly. The fix is
routing that path through the lifecycle's `stop`/`error`/`dispose`, not
adding a fourth ad-hoc cleanup call.

## Dictation defaults to a draft; auto-send is an explicit per-turn opt-in

`dictation-outcome.ts`'s `dictationOutcome` returns `"draft"` by default — a
transcript is a guess, and the composer is where that guess is cheapest to
catch before it leaves. `"send"` only fires when the caller passes
`voiceFirst: true` explicitly; any other value, including `false` or
`undefined`, keeps the safer draft behavior:

```ts
return options.voiceFirst === true
  ? { kind: "send", text }
  : { kind: "draft", text }
```

When wiring a new dictation entry point, the opt-in must be explicit at that
call site, per turn or per session — never inferred from context (e.g. "the
user is on a live call, so probably send it").

## When to reach for this

- Adding a fourth voice-adjacent surface: give it its own state module sized
  to its own promise, matching this file's shape (states, a total transition
  function, a presentation record keyed by state).
- Any new capture path: build it on `createCaptureLifecycle`, don't hand-roll
  track/context cleanup.
- Any new transcript-to-composer path: route it through `dictationOutcome`
  so the send-vs-draft decision stays testable without a UI in the loop.
