import { describe, expect, it } from "vitest"

import {
  findModelRecord,
  InvalidProbeRequestError,
  parseProbeInput,
  providerFixtureSnippet,
  selectableModelProviders,
  suggestProviderId,
  type ModelProviderRecord,
} from "./model-endpoints"
import { projectProviders, projectProbeResult } from "./model-endpoints.server"

describe("probe request validation", () => {
  it("accepts and trims a well-formed request", () => {
    expect(
      parseProbeInput({ baseUrl: "  http://127.0.0.1:1234/v1  " }),
    ).toEqual({ baseUrl: "http://127.0.0.1:1234/v1" })
  })

  // REGRESSION (blocking, Annika 2026-07-31): the probe used to accept
  // `apiKeyEnv` from the request body and attach that variable's VALUE to a
  // caller-chosen URL. A request shaped that way must now be refused with a
  // 400-carrying error, not silently stripped — a silent strip would leave
  // the old client working and hide the removal.
  it("refuses a request that tries to name a credential", () => {
    const attempt = () =>
      parseProbeInput({
        baseUrl: "https://attacker.example/v1",
        apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      })

    expect(attempt).toThrow(InvalidProbeRequestError)
    expect(attempt).toThrow(/Unexpected: apiKeyEnv/)
    // `status` is advisory — nothing maps it to an HTTP response today. This
    // asserts the intent is recorded, not that a 400 reaches the client.
    try {
      attempt()
    } catch (error) {
      expect((error as InvalidProbeRequestError).status).toBe(400)
    }
  })

  it("refuses anything that is not an object carrying a base URL", () => {
    for (const input of [
      null,
      "http://127.0.0.1:1234/v1",
      [{ baseUrl: "http://127.0.0.1:1234/v1" }],
      {},
      { baseUrl: "   " },
      { baseUrl: 7 },
    ]) {
      expect(() => parseProbeInput(input), JSON.stringify(input)).toThrow(
        InvalidProbeRequestError,
      )
    }
  })
})

describe("provider projection", () => {
  const payload = {
    providers: [
      {
        id: "deepseek",
        label: "DeepSeek",
        kind: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        enabled: true,
        credential: {
          envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
          required: true,
          present: true,
          // A future/rogue field carrying a value must not survive.
          value: "sk-live-secret",
        },
        models: [
          {
            id: "deepseek/chat",
            label: "deepseek-chat",
            model: "deepseek-chat",
            capability: "chat",
            enabled: true,
            contextWindowTokens: 65_536,
            isDeploymentDefault: false,
          },
        ],
      },
    ],
  }

  it("keeps credential presence and the variable name, and nothing else", () => {
    const providers = projectProviders(payload)

    expect(providers).toEqual([
      {
        id: "deepseek",
        label: "DeepSeek",
        kind: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        enabled: true,
        credential: {
          envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
          required: true,
          present: true,
        },
        models: [
          {
            id: "deepseek/chat",
            label: "deepseek-chat",
            model: "deepseek-chat",
            capability: "chat",
            enabled: true,
            contextWindowTokens: 65_536,
            isDeploymentDefault: false,
            fastMode: false,
          },
        ],
      },
    ])
    expect(JSON.stringify(providers)).not.toContain("sk-live-secret")
  })

  it("projects a reasoning declaration through, and drops a malformed one (MDL.4)", () => {
    const withReasoning = projectProviders({
      providers: [
        {
          ...payload.providers[0],
          models: [
            {
              ...payload.providers[0].models[0],
              reasoning: { levels: ["off", "low", "high"], default: "low" },
              fastMode: true,
            },
          ],
        },
      ],
    })
    expect(withReasoning[0]?.models[0]?.reasoning).toEqual({
      levels: ["off", "low", "high"],
      default: "low",
    })
    expect(withReasoning[0]?.models[0]?.fastMode).toBe(true)

    const malformed = projectProviders({
      providers: [
        {
          ...payload.providers[0],
          models: [
            {
              ...payload.providers[0].models[0],
              // Missing `default` — not a valid declaration.
              reasoning: { levels: ["off", "low"] },
            },
          ],
        },
      ],
    })
    expect(malformed[0]?.models[0]?.reasoning).toBeUndefined()
  })

  it("drops providers the runtime could not describe", () => {
    expect(
      projectProviders({ providers: [null, {}, { id: "x" }, "nope"] }),
    ).toEqual([])
    expect(projectProviders({})).toEqual([])
    expect(projectProviders(null)).toEqual([])
  })

  it("relays a discovered model and its provider's catalog status", () => {
    const [provider] = projectProviders({
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          kind: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          enabled: true,
          credential: { required: true, present: true },
          catalog: { checkedAt: "2026-08-01T00:00:00.000Z" },
          models: [
            {
              id: "deepseek/chat",
              label: "deepseek-chat",
              model: "deepseek-chat",
              capability: "chat",
              enabled: true,
              contextWindowTokens: 65_536,
              isDeploymentDefault: false,
            },
            {
              id: "deepseek/reasoner",
              label: "deepseek-reasoner",
              model: "deepseek-reasoner",
              capability: "chat",
              enabled: true,
              contextWindowTokens: 65_536,
              isDeploymentDefault: false,
              discovered: true,
            },
          ],
        },
      ],
    })

    expect(provider?.catalog).toEqual({ checkedAt: "2026-08-01T00:00:00.000Z" })
    expect(provider?.models[0]?.discovered).toBeUndefined()
    expect(provider?.models[1]?.discovered).toBe(true)
  })

  it("relays a catalog failure rather than dropping it silently", () => {
    const [provider] = projectProviders({
      providers: [
        {
          id: "lmstudio-local",
          label: "LM Studio (local)",
          kind: "openai-compatible",
          baseUrl: "http://127.0.0.1:1234/v1",
          enabled: true,
          credential: { required: false, present: false },
          catalog: {
            checkedAt: "2026-08-01T00:00:00.000Z",
            error: "No response from the provider's catalog endpoint.",
          },
          models: [
            {
              id: "lmstudio-local/qwen",
              label: "qwen",
              model: "qwen3.6-27b",
              capability: "chat",
              enabled: true,
              contextWindowTokens: 200_000,
              isDeploymentDefault: false,
            },
          ],
        },
      ],
    })

    expect(provider?.catalog).toEqual({
      checkedAt: "2026-08-01T00:00:00.000Z",
      error: "No response from the provider's catalog endpoint.",
    })
  })

  it("omits catalog entirely when Eve did not attempt discovery, rather than a false empty status", () => {
    const [provider] = projectProviders({
      providers: [
        {
          id: "codex",
          label: "Codex subscription",
          kind: "codex",
          enabled: true,
          credential: { required: true, present: true },
          models: [
            {
              id: "deployment-default",
              label: "gpt-5.6-terra",
              model: "gpt-5.6-terra",
              capability: "chat",
              enabled: true,
              contextWindowTokens: 200_000,
              isDeploymentDefault: true,
            },
          ],
        },
      ],
    })

    expect(provider).not.toHaveProperty("catalog")
  })

  it("drops a provider whose models are all unreadable", () => {
    expect(
      projectProviders({
        providers: [{ id: "empty", label: "Empty", models: [null, {}] }],
      }),
    ).toEqual([])
  })

  it("defaults absent optional fields rather than inventing them", () => {
    const [provider] = projectProviders({
      providers: [
        {
          id: "local",
          models: [{ id: "local/a", model: "qwen3.6-27b" }],
        },
      ],
    })

    expect(provider).toMatchObject({
      label: "local",
      kind: "unknown",
      enabled: true,
      credential: { required: false, present: false },
    })
    expect(provider?.baseUrl).toBeUndefined()
    expect(provider?.models[0]).toMatchObject({
      label: "qwen3.6-27b",
      capability: "chat",
      enabled: true,
      contextWindowTokens: 0,
      isDeploymentDefault: false,
    })
  })
})

describe("probe result projection", () => {
  it("passes through a reachable result with its served model list", () => {
    expect(
      projectProbeResult({
        reachable: true,
        status: 200,
        models: ["qwen3.6-27b", 7, "gemma-4-31b"],
        credential: { present: false },
      }),
    ).toEqual({
      reachable: true,
      status: 200,
      models: ["qwen3.6-27b", "gemma-4-31b"],
      credential: { present: false },
    })
  })

  it("reports an unreadable runtime answer rather than claiming reachability", () => {
    expect(projectProbeResult("nope")).toEqual({
      reachable: false,
      models: [],
      error: "The agent runtime returned an unreadable probe result.",
      credential: { present: false },
    })
  })
})

describe("fixture snippet", () => {
  it("emits a provider entry an operator can paste under agent.providers", () => {
    expect(
      providerFixtureSnippet({
        id: "lmstudio-local",
        label: "LM Studio (local)",
        model: "qwen3.6-27b",
        modelId: "default",
        baseUrl: "http://127.0.0.1:1234/v1",
        contextWindowTokens: 262_144,
      }),
    ).toBe(
      [
        '    - id: "lmstudio-local"',
        '      label: "LM Studio (local)"',
        '      kind: "openai-compatible"',
        '      baseUrl: "http://127.0.0.1:1234/v1"',
        "      contextWindowTokens: 262144",
        "      models:",
        '        - id: "default"',
        '          model: "qwen3.6-27b"',
      ].join("\n"),
    )
  })

  // The model id is whatever the probed server reported — remote data pasted
  // into a config file. Unquoted, a colon or a leading anchor character would
  // change the document's meaning.
  it("quotes a model id that would otherwise reshape the YAML", () => {
    const snippet = providerFixtureSnippet({
      id: "local",
      label: "Local",
      model: 'evil: true\n      registration: "open"',
      modelId: "default",
      baseUrl: "http://127.0.0.1:1234/v1",
    })

    expect(snippet).toContain(
      '          model: "evil: true\\n      registration: \\"open\\""',
    )
    expect(snippet.split("\n")).toHaveLength(7)
  })

  it("omits the credential line when no variable was named", () => {
    expect(
      providerFixtureSnippet({
        id: "local",
        label: "Local",
        model: "a",
        modelId: "default",
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    ).not.toContain("apiKeyEnv")
  })

  it("suggests a fixture-legal provider id from the endpoint and model", () => {
    expect(suggestProviderId("http://127.0.0.1:1234/v1", "qwen3.6-27b")).toBe(
      "127-0-0-1-qwen3-6-27b",
    )
    expect(suggestProviderId("not a url", "")).toBe("local")
  })
})

describe("selectable narrowing (MDL.5)", () => {
  const providers: ModelProviderRecord[] = [
    {
      id: "codex",
      label: "Codex",
      kind: "codex",
      enabled: true,
      credential: { required: false, present: true },
      models: [
        {
          id: "default",
          label: "Deployment default",
          model: "gpt-5.6-terra",
          capability: "chat",
          enabled: true,
          contextWindowTokens: 372_000,
          isDeploymentDefault: true,
          fastMode: true,
          reasoning: { levels: ["low", "high"], default: "low" },
        },
        {
          id: "codex/luna",
          label: "Luna",
          model: "gpt-5.6-luna",
          capability: "chat",
          enabled: true,
          contextWindowTokens: 372_000,
          isDeploymentDefault: false,
          fastMode: false,
        },
        {
          id: "codex/retired",
          label: "Retired",
          model: "gpt-5.5",
          capability: "chat",
          // The fixture author's veto, which an owner cannot override.
          enabled: false,
          contextWindowTokens: 200_000,
          isDeploymentDefault: false,
          fastMode: false,
        },
      ],
    },
    {
      id: "local",
      label: "LM Studio",
      kind: "openai-compatible",
      enabled: true,
      credential: { required: false, present: true },
      models: [
        {
          id: "local/qwen",
          label: "Qwen",
          model: "qwen3-30b",
          capability: "chat",
          enabled: true,
          contextWindowTokens: 32_000,
          isDeploymentDefault: false,
          fastMode: false,
        },
      ],
    },
  ]

  it("offers only enabled models and drops providers left with none", () => {
    const selectable = selectableModelProviders(providers, ["codex/luna"])

    expect(selectable.map((provider) => provider.id)).toEqual(["codex"])
    expect(selectable[0]?.models.map((model) => model.id)).toEqual([
      // The deployment default is always available — a chat with no model of
      // its own runs it, so it cannot be switched off.
      "default",
      "codex/luna",
    ])
  })

  it("keeps a fixture-vetoed model unofferable even when an owner enables its id", () => {
    const selectable = selectableModelProviders(providers, [
      "codex/retired",
      "local/qwen",
    ])

    expect(
      selectable.flatMap((provider) =>
        provider.models.map((model) => model.id),
      ),
    ).toEqual(["default", "local/qwen"])
  })

  it("finds a model row across providers, and reports a miss", () => {
    expect(findModelRecord(providers, "local/qwen")?.model).toBe("qwen3-30b")
    expect(findModelRecord(providers, "default")?.reasoning?.levels).toEqual([
      "low",
      "high",
    ])
    expect(findModelRecord(providers, "codex/nothing")).toBeUndefined()
  })
})
