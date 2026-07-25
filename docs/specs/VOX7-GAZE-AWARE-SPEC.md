# VOX.7 — Gaze-aware: show the agent what you're looking at; meet their gaze

Roadmap: VOX.7. Owner model: OPUS (taste-bearing AX — Claude only).
Depends on the GZ.1 gaze spike (labs.gaze) and the attention envelope.

## Goal

Two capabilities on top of the existing gaze spike and attention system:

1. GAZE AS ATTENTION INPUT — the screen region under the user's gaze becomes
   part of the same bounded, privacy-filtered attention payload text chat
   already sends, so "what am I looking at?" is answerable literally.
2. MEET THEIR GAZE — detect gaze on the agent's portrait/avatar and let
   presence respond (the portrait acknowledges being looked at; in a voice
   conversation, looking at the agent while speaking disambiguates addressee).

## Study first

- `apps/web/src/routes/labs.gaze.tsx` (the GZ.1 spike) — what tracking quality
  and API it actually provides; this spec is gated on that being usable.
- The attention envelope: how text chat serializes bounded attention with
  privacy + exclusions (search `agent-attention`, `workspace-attention`,
  the context tray/exclusions). Gaze region MUST ride this envelope — do NOT
  invent a parallel voice/gaze context format (assessment §2).
- Agent portrait: `apps/web/src/components/agent(s)/agent-portrait.tsx`.

## Build

### Capability 1 — gaze as attention

- A gaze-region signal (the focused element / region under gaze) folded into
  the existing attention payload, subject to the SAME preview + exclusion
  rules as every other attention source. Gaze is ADVISORY attention, never
  authorization — tool access still re-authorizes against resource scope.
- Continuous gaze capture is its own CONSENT surface: explicit, visible,
  reversible — exactly like the mic. No always-watching by default. Build the
  toggle + live-state indicator with the same restraint as the voice controls
  (`ux-design-language`: every colour/shadow/motion justifies itself).
- Test the behavioral consequence: with gaze on element X, the attention
  payload names X (privacy-permitted); with X excluded in the context tray,
  gaze does NOT surface it (retrieval-is-not-use — A/B it).

### Capability 2 — meet their gaze

- Detect gaze dwell on the portrait/avatar; the portrait responds (subtle
  presence acknowledgement — your taste on the exact affordance; keep it
  restrained, tokens only, motion justified).
- In voice-conversation mode (VOX.3, shipped), gaze-on-agent-while-speaking is
  an addressee signal — wire it as advisory metadata on the turn, not a hard
  gate.

## Guardrails

- Privacy first: gaze is intimate data. It never leaves the device beyond the
  bounded, exclusion-filtered attention payload; never logged raw; the consent
  surface is honest about what is captured and when.
- Browser verification (does the tracking feel right, does the portrait
  response land) is DAVID's — end with a click-list, do not drive browser
  automation.

## Verify

Component/unit tests (fixture-derived, no hardcoded counts) + typecheck. Report
files, test counts, the A/B attention-consequence test, design justifications
for every visual choice, and the human click-list. If the GZ.1 spike's
tracking is not good enough to build on, STOP and report that with evidence —
do not fake tracking quality.
