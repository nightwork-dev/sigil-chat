import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"
import { makeBaseContext, ToolRegistry } from "@gonk/tool-registry"
import {
  createFileSessionArtifactStore,
  type SessionArtifactStore,
} from "@workspace/artifact-store/repository"
import type {
  ArtifactScopeAction,
  CanAccessScope,
} from "@workspace/artifact-store/types"
import { describe, expect, it } from "vitest"

import { sigilApprovalProvider } from "./approval.js"
import { registerSpeechTools, MAX_SYNTHESIZABLE_LENGTH } from "./speech.js"
import type { PersonaVoiceResolver } from "./speech.js"
import type {
  SpeechSynthesisProvider,
  SpeechSynthesisRequest,
} from "./speech-provider.js"
import { synthesizeThroughVoiceProvider } from "./speech-provider.js"

const SCOPE = "session:thread-1"

// A provider stand-in that records what the tool asked for. The upstream HTTP
// call has its own tests below; these exercise the tool's contract.
function recordingProvider(): {
  provider: SpeechSynthesisProvider
  calls: SpeechSynthesisRequest[]
} {
  const calls: SpeechSynthesisRequest[] = []
  const provider: SpeechSynthesisProvider = async (request) => {
    calls.push(request)
    return {
      bytes: new TextEncoder().encode(`audio:${request.text}`),
      mediaType: "audio/mpeg",
      voice: request.voice ?? "af_heart",
      format: request.format ?? "mp3",
      model: "kokoro",
    }
  }
  return { provider, calls }
}

async function temporaryStore(
  options: { canAccessScope?: CanAccessScope } = {},
): Promise<SessionArtifactStore> {
  return createFileSessionArtifactStore({
    root: await mkdtemp(join(tmpdir(), "sigil-speech-artifacts-")),
    ...(options.canAccessScope
      ? { canAccessScope: options.canAccessScope }
      : {}),
  })
}

// Composed with the application's own approval provider, so every test below
// runs the real gate rather than an ad-hoc permissive one. A registry with no
// approval provider denies every write tool outright — which is itself proof
// that this tool sits inside the normal approval flow.
function registryWith(
  artifacts: SessionArtifactStore,
  provider: SpeechSynthesisProvider,
  personaVoice?: PersonaVoiceResolver,
  registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  }),
): ToolRegistry {
  registerSpeechTools(registry, artifacts, provider, personaVoice)
  return registry
}

async function invoke(
  registry: ToolRegistry,
  input: unknown,
  env: Record<string, string | undefined> = {},
  personaId?: string,
): Promise<
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; message: string; code?: string }
> {
  for await (const event of registry.invoke(
    "sigil-synthesize-speech",
    input,
    makeBaseContext({
      auth: allowAllAuth(),
      host: { resourceScope: SCOPE, ...(personaId ? { personaId } : {}) },
      env,
    }),
  )) {
    if (event.type === "result") {
      return { type: "result", data: event.data as Record<string, unknown> }
    }
    if (event.type === "error") {
      return {
        type: "error",
        message: event.message,
        ...(event.code ? { code: event.code } : {}),
      }
    }
  }
  throw new Error("No terminal event emitted.")
}

describe("sigil-synthesize-speech", () => {
  it("declares the write approval tier and a bounded input schema", async () => {
    const registry = registryWith(
      await temporaryStore(),
      recordingProvider().provider,
    )
    const tool = registry.get("sigil-synthesize-speech")

    expect(tool?.approval).toBe("write")
    expect(tool?.visibility).toBe("always")
    expect(tool?.inputJsonSchema).toMatchObject({
      type: "object",
      properties: {
        text: { maxLength: MAX_SYNTHESIZABLE_LENGTH },
        format: { enum: ["mp3", "opus", "aac", "wav", "flac", "pcm"] },
        speed: { minimum: 0.25, maximum: 4 },
      },
      required: ["text"],
      additionalProperties: false,
    })
  })

  it("stores synthesized audio in the request scope and returns a playable artifact reference", async () => {
    const artifacts = await temporaryStore()
    const { provider, calls } = recordingProvider()
    const registry = registryWith(artifacts, provider)

    const event = await invoke(registry, {
      text: "  The tide came in sideways.  ",
      voice: "am_michael",
      format: "wav",
      speed: 0.9,
    })

    expect(event.type).toBe("result")
    if (event.type !== "result") return
    expect(event.data).toMatchObject({
      mediaType: "audio/mpeg",
      voice: "am_michael",
      format: "wav",
      speed: 0.9,
      scope: SCOPE,
      text: "The tide came in sideways.",
    })
    expect(event.data.url).toBe(
      `/api/media/artifact?key=${encodeURIComponent(String(event.data.artifactId))}&scope=${encodeURIComponent(SCOPE)}`,
    )

    // The delivery parameters reached the provider rather than being dropped
    // in favour of the deployment defaults.
    expect(calls[0]).toMatchObject({
      text: "The tide came in sideways.",
      voice: "am_michael",
      format: "wav",
      speed: 0.9,
    })

    const stored = await artifacts.listByScope(SCOPE, undefined)
    expect(stored.map((artifact) => artifact.id)).toContain(
      event.data.artifactId,
    )
    const content = await artifacts.readContent(
      String(event.data.artifactId),
      SCOPE,
      undefined,
    )
    expect(new TextDecoder().decode(content.bytes)).toBe(
      "audio:The tide came in sideways.",
    )
  })

  it("falls back to the deployment's default voice and format when unspecified", async () => {
    const { provider, calls } = recordingProvider()
    const event = await invoke(
      registryWith(await temporaryStore(), provider),
      { text: "Default delivery." },
    )

    expect(event.type).toBe("result")
    expect(calls[0]?.voice).toBeUndefined()
    expect(calls[0]?.format).toBeUndefined()
    if (event.type === "result") {
      expect(event.data).toMatchObject({ voice: "af_heart", format: "mp3" })
    }
  })

  it("passes the trusted host persona's voice defaults to the provider", async () => {
    const { provider, calls } = recordingProvider()
    const event = await invoke(
      registryWith(
        await temporaryStore(),
        provider,
        (personaId) => ({
          voice: personaId === "persona-a" ? "voice-a" : "voice-b",
          speed: 0.9,
        }),
      ),
      { text: "Persona delivery." },
      {},
      "persona-a",
    )

    expect(event.type).toBe("result")
    expect(calls[0]?.personaVoice).toEqual({
      voice: "voice-a",
      speed: 0.9,
    })
  })

  it("rejects text past the utterance bound before calling the provider", async () => {
    const artifacts = await temporaryStore()
    const { provider, calls } = recordingProvider()
    const registry = registryWith(artifacts, provider)

    const event = await invoke(registry, {
      text: "a".repeat(MAX_SYNTHESIZABLE_LENGTH + 1),
    })

    expect(event.type).toBe("error")
    expect(calls).toHaveLength(0)
    expect(await artifacts.listByScope(SCOPE, undefined)).toEqual([])
  })

  it("rejects malformed voice, format, and speed inputs", async () => {
    const artifacts = await temporaryStore()
    const { provider, calls } = recordingProvider()
    const registry = registryWith(artifacts, provider)

    for (const input of [
      { text: "hi", voice: "nice try\nAuthorization: Bearer x" },
      { text: "hi", format: "exe" },
      { text: "hi", speed: 40 },
      { text: "   " },
      { text: "hi", unexpected: true },
    ]) {
      expect((await invoke(registry, input)).type).toBe("error")
    }
    expect(calls).toHaveLength(0)
    expect(await artifacts.listByScope(SCOPE, undefined)).toEqual([])
  })

  it("reports provider failure as a tool error without leaking the provider URL or key", async () => {
    const artifacts = await temporaryStore()
    const failing: SpeechSynthesisProvider = () =>
      synthesizeThroughVoiceProvider({
        text: "unreachable",
        signal: new AbortController().signal,
        // A base URL that cannot be reached, plus a credential, so a naive
        // error path would have both to leak.
        env: {
          SIGIL_VOICE_TTS_BASE_URL: "http://127.0.0.1:9/v1",
          SIGIL_VOICE_TTS_API_KEY: "sk-secret-value",
        },
      })
    const event = await invoke(registryWith(artifacts, failing), {
      text: "unreachable",
    })

    expect(event.type).toBe("error")
    if (event.type !== "error") return
    expect(event.message).toContain("speech provider is unavailable")
    expect(event.message).not.toContain("127.0.0.1")
    expect(event.message).not.toContain("http")
    expect(event.message).not.toContain("sk-secret-value")
    expect(await artifacts.listByScope(SCOPE, undefined)).toEqual([])
  })

  it("writes through the scope-authorized repository: a read-only grant is refused", async () => {
    const seen: ArtifactScopeAction[] = []
    const artifacts = await temporaryStore({
      canAccessScope: (_principal, _scope, action) => {
        seen.push(action)
        return action === "read"
      },
    })
    const { provider } = recordingProvider()

    const event = await invoke(registryWith(artifacts, provider), {
      text: "Denied write.",
    })

    expect(event.type).toBe("error")
    // The tool asked the policy for "write" — not "read" — and the refusal
    // landed before any bytes were persisted.
    expect(seen).toContain("write")
    expect(
      await artifacts.listByScope(SCOPE, undefined).catch(() => []),
    ).toEqual([])
  })

  it("is gated by the host's approval provider like any other write tool", async () => {
    const artifacts = await temporaryStore()
    const { provider, calls } = recordingProvider()
    const denying = new ToolRegistry({
      security: {
        approvalProvider: {
          decide: () => ({
            outcome: "denied",
            reason: "test policy denies write tools",
          }),
        },
      },
    })

    const event = await invoke(registryWith(artifacts, provider, undefined, denying), {
      text: "Should never be synthesized.",
    })

    expect(event.type).toBe("error")
    if (event.type === "error") expect(event.code).toBe("APPROVAL_DENIED")
    expect(calls).toHaveLength(0)
    expect(await artifacts.listByScope(SCOPE, undefined)).toEqual([])
  })
})

function allowAllAuth(): AuthContext {
  return {
    principal: principal(),
    authorize: () => ({
      outcome: "allow",
      reason: "test policy",
      policyId: "test",
    }),
  }
}

function principal(): AuthenticatedPrincipal {
  return {
    id: "human:owner",
    kind: "human",
    identity: { issuer: "test", subject: "owner", method: "local" },
    delegation: {
      actorKind: "agent",
      actor: { issuer: "test", subject: "eve", method: "local" },
      actorId: "agent:eve",
      actorSessionId: "eve-session-1",
    },
    roles: [],
    scopes: [],
  }
}
