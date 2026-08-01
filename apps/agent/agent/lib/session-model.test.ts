import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import {
  findModelPreset,
  readBoundModelFromAttributes,
  readResolveContextAttributes,
  resolveSessionModel,
  resolveSessionModelFromAuth,
} from "./session-model"

const AGENT: SigilAgentConfig = {
  model: "gpt-5.6-terra",
  presets: [
    {
      id: "luna",
      label: "GPT-5.6 Luna (Codex subscription)",
      provider: "codex",
      model: "gpt-5.6-luna",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      provider: "openai-compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      contextWindowTokens: 65_536,
    },
  ],
}

function authContext(binding: unknown) {
  return {
    session: {
      auth: {
        current: {
          attributes: {
            sigilExecutionBinding: JSON.stringify(binding),
          },
        },
        initiator: null,
      },
    },
  }
}

const LUNA_BINDING = {
  applicationThreadId: "thread-1",
  personaId: "eve",
  model: { presetId: "luna", provider: "codex", modelId: "gpt-5.6-luna" },
}

describe("preset lookup", () => {
  it("finds the deployment default and authored presets by id", () => {
    expect(findModelPreset(AGENT, "deployment-default")?.model).toBe(
      "gpt-5.6-terra",
    )
    expect(findModelPreset(AGENT, "luna")?.model).toBe("gpt-5.6-luna")
    expect(findModelPreset(AGENT, "nope")).toBeUndefined()
  })
})

describe("reading the bound model from verified attributes", () => {
  it("reads the model a session was bound to", () => {
    expect(
      readBoundModelFromAttributes({
        sigilExecutionBinding: JSON.stringify(LUNA_BINDING),
      }),
    ).toEqual({
      presetId: "luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
    })
  })

  it("treats every unreadable shape as no choice rather than throwing", () => {
    expect(readBoundModelFromAttributes(undefined)).toBeUndefined()
    expect(readBoundModelFromAttributes({})).toBeUndefined()
    expect(
      readBoundModelFromAttributes({ sigilExecutionBinding: "not json" }),
    ).toBeUndefined()
    expect(
      readBoundModelFromAttributes({ sigilExecutionBinding: "null" }),
    ).toBeUndefined()
    // A binding with no model is the ordinary pre-existing session.
    expect(
      readBoundModelFromAttributes({
        sigilExecutionBinding: JSON.stringify({ personaId: "eve" }),
      }),
    ).toBeUndefined()
    // A malformed model must not be half-trusted.
    expect(
      readBoundModelFromAttributes({
        sigilExecutionBinding: JSON.stringify({ model: { presetId: "luna" } }),
      }),
    ).toBeUndefined()
  })

  it("falls back to the initiator context for delegated sessions", () => {
    const attributes = readResolveContextAttributes({
      session: {
        auth: {
          current: null,
          initiator: {
            attributes: {
              sigilExecutionBinding: JSON.stringify(LUNA_BINDING),
            },
          },
        },
      },
    })

    expect(readBoundModelFromAttributes(attributes)?.presetId).toBe("luna")
  })
})

describe("per-session model resolution", () => {
  // Criterion 2 shape: two sessions of one deployment, resolved independently
  // from their own bindings, land on different models at the same time.
  it("resolves luna for a luna session while a default session falls back", () => {
    const luna = resolveSessionModelFromAuth(
      AGENT,
      readResolveContextAttributes(authContext(LUNA_BINDING)),
    )
    const unbound = resolveSessionModelFromAuth(
      AGENT,
      readResolveContextAttributes(
        authContext({ applicationThreadId: "thread-2", personaId: "eve" }),
      ),
    )

    expect(luna).toMatchObject({
      presetId: "luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
    })
    // null is Eve's "use the compiled fallback" — i.e. the deployment default.
    expect(unbound).toBeNull()
  })

  it("carries the preset's context window, not the deployment default's", () => {
    const selection = resolveSessionModel(
      AGENT,
      {
        presetId: "deepseek",
        provider: "openai-compatible",
        modelId: "deepseek-chat",
      },
      { env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-test" } },
    )

    expect(selection?.modelContextWindowTokens).toBe(65_536)
    expect(selection?.provider).toBe("openai-compatible")
  })

  it("falls back rather than failing when the credential is gone", () => {
    expect(
      resolveSessionModel(
        AGENT,
        {
          presetId: "deepseek",
          provider: "openai-compatible",
          modelId: "deepseek-chat",
        },
        { env: {} },
      ),
    ).toBeNull()
  })

  it("falls back rather than failing when the preset left the fixture", () => {
    expect(
      resolveSessionModel(AGENT, {
        presetId: "retired",
        provider: "codex",
        modelId: "gpt-4",
      }),
    ).toBeNull()
  })

  // Criterion 3 shape: the choice lives in the immutable binding, so anything
  // that replays that binding — a rotated runtime session included — resolves
  // the same model. Rotation changes runtimeSessionId, never the model.
  it("resolves identically across a runtime session rotation", () => {
    const before = resolveSessionModelFromAuth(
      AGENT,
      readResolveContextAttributes(
        authContext({ ...LUNA_BINDING, runtimeSessionId: "eve-session-1" }),
      ),
    )
    const after = resolveSessionModelFromAuth(
      AGENT,
      readResolveContextAttributes(
        authContext({ ...LUNA_BINDING, runtimeSessionId: "eve-session-2" }),
      ),
    )

    expect(after?.presetId).toBe(before?.presetId)
    expect(after?.modelId).toBe("gpt-5.6-luna")
  })
})
