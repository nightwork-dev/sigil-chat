# VOX.9 progress

Implemented the contract-only voice-conversion pipeline and persona-scoped
voice defaults. No commit or push was made.

## Files

- `packages/runtime-env/src/voice.ts`, `topology.ts`, `voice.test.ts`
  - Added optional deployment conversion configuration.
  - Added the shared injectable, fail-open conversion helper.
  - Added the typed `tts.voice` persona-scope extension.
- `apps/web/src/lib/agent-voice.server.ts`, `agent-voice.ts`,
  `agent-profile.server.ts`, `spoken-replies.ts`, their changed tests, and the
  two existing speech consumers under `components/agent/`
  - Resolve the bound persona voice for reply/read-aloud speech.
  - Send only the persona id from the browser; voice settings and credentials
    remain server-side.
- `packages/agent-tools/src/speech-provider.ts`, `speech.ts`, `registry.ts`,
  and their changed tests
  - Resolve the trusted tool-host persona and apply the same conversion helper.
  - Explicit per-call voice, format, and speed remain higher precedence than
    their corresponding defaults.
- `apps/agent/agent/lib/memory.ts`, `application-services.ts`
  - Inject the persona-scope voice resolver into the application-tool registry.

## Conversion request/response contract

The conversion service is external:

```text
POST {conversion.baseURL}/convert
Content-Type: multipart/form-data
Authorization: Bearer {apiKey}  # only when configured

audio           = binary TTS response, filename speech.{inputFormat}
model           = configured conversion model id
voice           = configured target voice id
response_format = configured output format
```

Success is raw audio bytes with an optional `audio/*` content type. Empty,
rejected, unreachable, or over-32-MiB conversion responses degrade to the
original TTS bytes and media type. Upstream bodies, endpoint URLs, credentials,
and converter exception messages are never returned.

Deployment environment fields are
`SIGIL_VOICE_CONVERSION_ENABLED`, `_BASE_URL`, `_MODEL`, `_VOICE`, `_FORMAT`,
and `_API_KEY`. Persona identity uses Gonk's namespaced persona-scope key
`tts.voice`, shaped as `{ voice, speed?, style?, conversion? }`.

## Falsification runs

- Targeted Vitest run: **6 files, 61 tests passed**.
  - No conversion config: same `Uint8Array` object returned; converter not
    called.
  - Conversion present: converter received exact TTS bytes; converted bytes and
    media type returned.
  - Converter throws a message containing a secret endpoint and credential:
    speech still returns the original TTS bytes with status 200; neither value
    appears in the result/error surface.
  - Persona A and B resolve different voice/speed defaults.
  - Explicit per-call voice wins over the persona provider-voice default.
  - Trusted tool-host persona reaches the synthesis provider.
  - Reply-speech client projects only `x-sigil-persona-id`.
- `packages/runtime-env` typecheck: passed.
- `packages/agent-tools` typecheck: passed with the worktree runtime-env source
  explicitly selected.
- `git diff --check`: passed.
- Root `pnpm install` could not complete because the public registry returned
  404 for pinned `@zigil/agent-eve@0.1.7`; offline retry also lacked
  `tar-fs@2.1.5`. The targeted tests used the already-installed dependency
  toolchain from the adjacent development worktree with exact aliases back to
  this worktree, then all temporary links/config were removed.
- A broad web typecheck under that borrowed dependency tree was not a valid
  green gate: it lacked this worktree's generated route tree and resolved
  unrelated workspace packages from the adjacent checkout. It did identify one
  changed-file `Response` body type issue, which was fixed before the final
  61-test green run.

## Required stop boundaries

- **Hardware:** stopped at the injectable HTTP contract. No RVC weights, torch,
  ONNX, GPU/MLX inference stack, model server, or multi-GB asset was installed,
  downloaded, or run.
- **Identity safety:** no arbitrary cloning, voice-sample upload, or training
  path was added. `tts.voice` is only a typed sidecar extension point.
- **Taste-bearing UI:** no persona voice picker or persona-settings control was
  built. A future consent-gated UI can author the typed `tts.voice` sidecar;
  this change only reads it.
