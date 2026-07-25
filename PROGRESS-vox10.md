# VOX.10 Axis 1 progress

Status: complete for speaker-labeled STT only. Changes are uncommitted.

## Files

- `packages/runtime-env/src/voice.ts`
  - Adds `SttProviderConfig.diarization`.
  - Defaults both voice profiles to `false`.
  - Resolves the explicit `SIGIL_VOICE_STT_DIARIZATION=true|false` capability.
- `packages/runtime-env/src/topology.ts`
  - Adds the typed invalid-diarization configuration error code.
- `packages/runtime-env/src/voice.test.ts`
  - Locks the false default, explicit true capability, and invalid-value branch.
- `apps/web/src/lib/agent-transcription.ts`
  - Adds the advisory `DiarizedTranscriptSegment`, transcript result shapes,
    and pure `mergeDiarizedSegments` helper.
  - Documents that speaker labels are not principals and carry no scope.
  - Leaves multi-party transcript presentation to the UI owner.
- `apps/web/src/lib/agent-transcription.test-fixtures.ts`
  - Provides the diarized segment fixture used by helper and provider tests.
- `apps/web/src/lib/agent-transcription.test.ts`
  - Tests consecutive-speaker merging with expectations derived from the
    fixture.
  - Type-locks and runtime-locks the absence of `principal` and `scope`.
- `apps/web/src/lib/agent-transcribe.server.ts`
  - Accepts optional multipart `diarize=true`.
  - Sends `diarize=true` upstream only when the resolved provider advertises
    the capability.
  - Returns provider segments without inventing speaker labels.
- `apps/web/src/lib/agent-transcribe.server.test.ts`
  - Tests both provider capability branches with fakes.
- `PROGRESS-vox10.md`
  - This report.

## Extended transcribe contract

Request remains multipart with `audio`; callers may additionally send
`diarize=true`.

- No diarization request: `{ text }` (unchanged).
- Diarization requested and provider capability is true:
  `{ text, segments: [{ speaker, text, start, end }] }`.
- Diarization requested and provider capability is false:
  `{ text, diarization: "unavailable" }`.

The route never fabricates a speaker. A configured diarizing provider that
returns a malformed segments payload is treated as an upstream contract failure
(`502`).

## Verification

- Web targeted Vitest: 2 files, 15 tests passed.
  - Diarizing fake provider returns its typed segments and receives the
    `diarize=true` provider parameter.
  - Non-diarizing fake provider receives no diarization parameter and returns
    flat text plus `diarization: "unavailable"`.
  - The not-authentication test proves the segment/turn shape has no
    `principal` or `scope` field.
  - The merge-helper test derives its turn count from the fixture.
- Runtime-env targeted Vitest: 1 file, 17 tests passed.
- Web targeted ESLint: passed.
- Web `tsc --noEmit`: passed.
- Runtime-env package typecheck (`tsc --noEmit`): passed.
- Full web typecheck script, including Vite client/SSR/Nitro builds: passed.

## Stop point

Stopped at the Axis 1 provider contract, typed segments, merge helper, and
tests. Did not begin Axis 2, touch a coordinator or `claude-comms`, install or
fetch a diarization model/GPU stack, or build the taste-bearing multi-party
transcript UI.
