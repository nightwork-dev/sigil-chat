# Live voice harness assessment — the voice agent's own note

> PROVENANCE: authored 2026-07-25 by the live-voice agent itself — the codex
> realtime thread David spoke to through the D-2 surface (session
> `019f9b00-bf35-7d42-a106-2e79246dc472`, originator `sigil-chat`, rollout
> verified on disk). It wrote this into `docs.local/` using the local harness
> authority it is describing; promoted verbatim into specs because its
> assessment is correct against the code and SUPERSEDES the prior D-3 scope.
> Nothing below this line has been edited.

# Live voice harness assessment

Date: 2026-07-25

## The central finding

Live voice is currently a second agent boundary, not a voice transport for the
existing Sigil Chat agent.

Normal text chat goes through the app-owned Eve session. That path carries the
verified principal, bound persona, application thread, authorized resource
scope, selected UI context, context privacy choices, memory, shared blackboard,
and the native Sigil/Gonk application-tool registry.

Live voice instead starts a fresh `codex app-server` thread:

- `agent/lib/realtime-appserver.ts` launches `codex app-server --stdio`.
- `thread/start` is called with no Sigil application binding or initial
  context.
- `mcp_servers={}` deliberately removes the Gonk/Sigil MCP surface.
- The offer route authenticates the principal, but only passes `principalId`
  into `RealtimeVoiceHost`; it does not pass the application thread, persona,
  resource scope, attention, memory, blackboard, tool preference, or transcript.
- The browser associates the call with a visible Sigil thread for navigation,
  but the server-side realtime thread is not that Eve thread.

That is why the live voice agent can sound like a strange mixture of local
Codex, the current checkout, and Sigil Chat. It inherits local Codex process
context and project instructions, but it is not actually inhabiting the Sigil
agent session the UI says the call belongs to.

This is more than a UX rough edge. It is an identity, capability-honesty, and
authority-boundary problem.

## What I could and could not perceive in this conversation

From the embedded realtime executor, I could perceive:

- the local working directory and repository instructions;
- local filesystem and command-execution capabilities exposed by Codex;
- installed Codex skills/plugins and some read-only continuity surfaces;
- the conversation transcript relayed by the realtime intermediary.

I could not automatically perceive:

- the current Sigil route, workspace, focused object, or ordered selection;
- the context privacy level or context exclusions chosen in the UI;
- the bound Eve persona and its actual Sigil session identity;
- the Sigil application thread's prior messages and persisted runtime state;
- the thread's authorized project/workspace/session resource scope;
- its shared blackboard or Eve-scoped memory injection;
- the native Sigil application tools available to the Eve agent;
- the visible state of the app except where source code or transcript text
  happened to describe it.

The dangerous part is that local Codex capabilities make the voice agent feel
powerful enough to confidently blur those distinctions. It can say "I can edit
files and run commands," which may be true of its local harness, while the user
reasonably hears that as a claim about the bound Sigil agent and current
workspace.

## Where this conversation is recorded

This specific conversation is being persisted as a native Codex rollout at:

`/Users/dr/.codex/sessions/2026/07/25/rollout-2026-07-25T13-39-05-019f9b00-bf35-7d42-a106-2e79246dc472.jsonl`

Verified session metadata:

- session id: `019f9b00-bf35-7d42-a106-2e79246dc472`;
- originator: `sigil-chat`;
- realtime active: `true`;
- cwd: `/Users/dr/Dev/templates/worktrees/sigil-chat-dev/apps/agent`;
- git branch at session start: `dev`;
- the JSONL contains the relayed `transcript_delta` text, assistant turns, tool
  calls/results, session metadata, and turn context.

This is a Codex execution trace, not yet a clean Sigil conversation artifact.
The voice transcript is embedded inside `<realtime_delegation>` messages and
repeated deltas rather than persisted as normalized user/assistant turns in the
bound Sigil application thread. It may also contain local paths, tool evidence,
and instruction context, so it should not be displayed or shared as though it
were an ordinary user transcript without a redaction/normalization boundary.

The app-server already recognizes realtime transcript notifications, but
`RealtimeVoiceHost` does not currently subscribe to them or project them into
Sigil persistence. That is the clean seam for capturing committed speech turns
without scraping `.codex/sessions`.

## Product judgment

Do not improve this by adding a larger prompt to the standalone realtime
thread. A better prompt would make the split less obvious without repairing
it.

The target contract should be:

> Voice is an input/output mode for the same bound Eve agent. Starting voice
> must not create a second identity, memory, authority, tool universe, or
> conversation.

If the current Codex realtime API cannot satisfy that contract, label live
voice experimental and capability-limited rather than pretending it is the
same agent.

The local Codex harness is still valuable. It is a plausible coordinating or
background-agent runtime because it can inspect and change the real checkout,
run validations, use installed skills, and retain a native execution trace.
The mistake would be making that ambient local authority indistinguishable from
the user-facing Eve agent. Treat it as a named operator with explicit grants,
jobs, receipts, and application projections.

## What would be most useful to the agent

### 1. One host-authored capability manifest

At session start and whenever material capabilities change, give the agent a
small authoritative manifest containing:

- agent host: Eve, local Codex realtime, or another named controller;
- bound persona and application thread id;
- active resource scope and additional readable context scopes;
- available application tools, local tools, and whether mutations are allowed;
- attention delivery state and privacy level;
- memory, blackboard, and prior-thread continuity availability;
- modality limitations, especially whether live voice shares text-chat state.

Render the same manifest in the UI behind a plain-language "What this agent can
access" control. The agent should use this manifest to answer "what can you
do?" and "what can you see?" rather than inferring from ambient instructions.

Do not make browser-authored claims in the manifest authoritative. Identity,
scope, and tool grants must be reconstructed and signed server-side.

### 2. The existing Sigil attention envelope

Text chat already serializes bounded attention with privacy and exclusions:

- application and route;
- workspace identity and revision;
- primary and ordered multi-selection;
- bounded semantic activity history;
- explicit turn attachments.

Live voice needs the same envelope, with the same preview and exclusion rules.
Do not invent a parallel voice-context format.

The context is advisory task attention, not authorization. Tool access must
still be re-authorized against the verified resource scope at invocation time.

### 3. Real application-thread continuity

The live call should attach to the existing application thread and preserve:

- bound persona;
- Eve session id/application thread binding;
- persisted transcript and interruption state;
- memory and identity projection;
- shared blackboard;
- current resource perspective;
- normal tool discovery, approval preference, and invocation checks.

The existing browser-only `VoiceBoundThread` label is good navigation, but it
must describe a real server-side binding rather than a UI association.

### 4. Application tools through Eve

The realtime model should not receive an unrelated local tool universe and then
be expected to imitate Sigil behavior. Requests such as "open that," "annotate
this," "record this request," or "what am I looking at?" should execute through
the same Eve-hosted Gonk registry used by text chat.

This preserves:

- the principal and persona caller context;
- scope authorization at discovery and invocation;
- client-command/domain-outcome reconciliation;
- tool approval as a UI preference without mistaking it for security;
- consistent mutation receipts in the conversation and app UI.

### 5. Honest visual status

Until the boundary is repaired, the live voice control should disclose:

- that it opens a separate local Codex realtime thread;
- that it does not share the current Eve transcript, persona, memory,
  blackboard, attention, or application tools;
- whether it has local filesystem/command authority;
- where the microphone is bound and how to end the process.

"Voice is bound to thread X" currently overstates the backend relationship. A
more accurate interim label would be "Voice opened from thread X" with a
capability warning.

### 6. A first-class coordinator/background-agent bridge

For the eventual coordinating-agent use case, give local Codex a deliberate
application contract:

- create a bounded job from a specific authenticated principal, application
  thread, project/workspace scope, and desired outcome;
- attach only the context packet needed for that job;
- expose Sigil operations through authorized application tools rather than
  direct store edits;
- stream status, questions, evidence, and terminal state back into Sigil;
- require explicit approval for materially destructive, external-production,
  credential-gated, or scope-expanding actions;
- keep the native Codex session id as provenance, but project a normalized,
  redacted activity record into the application;
- support cancellation and make process/tool cleanup observable;
- distinguish the conversational Eve agent, the local Codex operator, and any
  delegated child agents in the UI and transcript.

The existing native Codex rollout is useful provenance. It should be linked,
not copied wholesale into Sigil. Sigil needs a small stable job/event contract,
while native Codex history remains the detailed source trace.

## Recommended implementation direction

Prefer a controller/adapter that keeps Eve authoritative:

1. The browser starts voice for a specific application thread.
2. The web server obtains the same signed application-thread binding and
   authorized resource-scope proof used by text chat.
3. Eve reconstructs the principal, persona, scope, context privacy choices,
   attention snapshot, memory, and blackboard.
4. The realtime transport handles microphone/audio and turn detection.
5. Committed user utterances enter the existing Eve application thread.
6. Eve produces the response and performs any Sigil tool calls.
7. The voice transport speaks/streams that Eve response.
8. Text and voice turns persist in one transcript with one interruption model.

The existing app-server client already exposes transcript notifications plus
`thread/realtime/appendText` and `thread/realtime/appendSpeech`, which may be
useful transport primitives. Do not assume they are sufficient: first prove
that the realtime side can be prevented from independently answering while Eve
owns the turn. If it cannot, use it only for a clearly separate experimental
mode or replace the controller.

Do not route live audio through Eve merely to unify ownership. Keep the current
WebRTC media path if possible; unify the semantic turn and authority path.

## Coding brief

### P0 — stop capability confusion

- Add a server-authored session capability manifest.
- Show it in the chat/context UI and make it available to the agent.
- Correct the live-voice copy so it does not claim a true Eve-thread binding
  before one exists.
- Add an initial realtime developer context that truthfully names the current
  boundary and forbids claims of unseen UI state or unavailable Sigil tools.
  This is a containment measure, not the final architecture.

### P1 — bind live voice to the actual Sigil session

- Extend the realtime offer request with the application thread id, signed
  session-binding proof, authorized resource scope, tool-approval preference,
  and the same privacy-filtered attention payload used by text chat.
- Verify all identity and scope fields server-side; never trust the browser
  payload by itself.
- Key `RealtimeVoiceHost` ownership by the bound application thread plus
  principal, not principal alone.
- Make stop/status inspect the exact bound call.

### P2 — make Eve the one agent

- Bridge committed realtime utterances into the existing Eve session.
- Return Eve output to the realtime speech path.
- Preserve persona, memory, blackboard, tool calls, interruption, persistence,
  client commands, and domain outcomes.
- Remove or quarantine any unrelated local Codex tool authority from the voice
  path.

### P3 — add the local Codex coordinator as an explicit product capability

- Define the minimal application job contract: request, authority envelope,
  native session id, progress events, questions/approvals, evidence, result,
  cancellation, and terminal status.
- Project it into a visible Sigil surface instead of relying on filesystem
  discovery of `.codex/sessions`.
- Normalize realtime transcript notifications into the application thread while
  retaining the native rollout path/id as provenance.
- Make every coordinator action name the actor and authority source.

## Acceptance tests

1. In a selected Review passage, ask by voice "what am I looking at?" The
   answer names only the privacy-permitted passage and its current revision.
2. Exclude the passage in the context tray and ask again. Voice does not
   receive or imply the excluded content.
3. Ask voice to annotate the passage. The normal Eve tool authorization runs,
   the annotation appears through the existing domain-outcome loop, and the
   transcript contains the tool result.
4. Begin in one thread, navigate elsewhere, and ask a follow-up. The call either
   remains visibly and actually bound to the original Eve thread or requires an
   explicit rebind; UI and backend never disagree.
5. Ask "who are you?", "what can you see?", and "what can you change?" in text
   and voice. Both modes answer from the same capability manifest.
6. Revoke resource access during a call. The next tool discovery/invocation
   fails visibly even if the earlier attention snapshot still names the object.
7. Stop voice during negotiation. The microphone, peer connection, realtime
   thread, and any controller process are all released.
8. Start two calls as the same principal in two application threads. Ownership
   and conflict messages identify the exact bound thread; neither call silently
   replaces the other.
9. Verify that no raw transcript, attention payload, bearer token, scope proof,
   or local path is exposed to the browser or logs beyond its intended boundary.
10. Launch a bounded background coding task from Sigil. The UI shows the local
    Codex actor, application scope, native session id, live evidence, approval
    requests, cancellation, and terminal result; direct store mutation outside
    authorized tools is neither implied nor silently performed.

## P2 GATE VERDICT (2026-07-25, measured — appended by the coordinator)

The P2 premise was tested live before building, per "Do not assume they are
sufficient", and it FAILS: `clientManagedHandoffs: true` stops Codex-side
responses being forwarded but does NOT stop the frontend realtime voice model
from answering the user unprompted — measured by RTP speech packets on a real
WebRTC call (positive control first, so silence is trustworthy) and by
sideband transcripts. A session prompt ordering silence was overridden in
both runs. The V3 session payload carries no `turn_detection`, so backend VAD
auto-response governs and ThreadRealtimeStartParams exposes no knob. Adjacent
doors verified shut: websocket transport requires API-key auth on a
subscription login; transcription-only realtime is rejected for WebRTC
("AVAS realtime calls require conversational realtime").
Evidence: docs/specs/evidence/realtime-handoff-gate.mjs (needs werift via
GATE_WERIFT_DIR; header documents the runs).

CONSEQUENCES:
- P2 as scoped is closed on this transport. The realtime call remains a
  SEPARATE, capability-limited voice agent; P0 containment and P1 true
  binding are the honest posture for it.
- "Voice as a modality of the bound Eve agent" is delivered instead by the
  half-duplex loop this repo already owns end-to-end (STT dictation →
  the real Eve session → TTS speak-replies): slower turn-taking, but the
  one-agent contract holds by construction — persona, memory, tools,
  approvals, transcript are the text path's own.
- Upstream ask filed as a spec note: a turnDetection/createResponse
  passthrough on ThreadRealtimeStartParams would reopen P2 as written.
- Incidental defect from every gate run: the app-server sideband control
  websocket resets ~40s into a session and transcripts stop arriving.
  Needs its own ticket before any transcript-dependent feature relies on it.

## Stop condition

This work is complete when text and live voice are demonstrably two modalities
of one Eve-owned application thread, and both the user and the agent can inspect
an authoritative capability manifest that matches observed behavior.
