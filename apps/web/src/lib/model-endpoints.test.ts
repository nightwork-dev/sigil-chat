import { describe, expect, it } from "vitest"

import {
  InvalidProbeRequestError,
  parseProbeInput,
  presetFixtureSnippet,
  suggestPresetId,
} from "./model-endpoints"
import { projectEndpoints, projectProbeResult } from "./model-endpoints.server"

describe("probe request validation", () => {
  it("accepts and trims a well-formed request", () => {
    expect(parseProbeInput({ baseUrl: "  http://127.0.0.1:1234/v1  " })).toEqual(
      { baseUrl: "http://127.0.0.1:1234/v1" },
    )
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

describe("model endpoint projection", () => {
  it("keeps credential presence and the variable name, and nothing else", () => {
    const endpoints = projectEndpoints({
      endpoints: [
        {
          id: "deepseek",
          label: "DeepSeek",
          provider: "openai-compatible",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com/v1",
          contextWindowTokens: 65_536,
          isDeploymentDefault: false,
          credential: {
            envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
            required: true,
            present: true,
            // A future/rogue field carrying a value must not survive.
            value: "sk-live-secret",
          },
        },
      ],
    })

    expect(endpoints).toEqual([
      {
        id: "deepseek",
        label: "DeepSeek",
        provider: "openai-compatible",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
        contextWindowTokens: 65_536,
        isDeploymentDefault: false,
        credential: {
          envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
          required: true,
          present: true,
        },
      },
    ])
    expect(JSON.stringify(endpoints)).not.toContain("sk-live-secret")
  })

  it("drops entries the runtime could not describe", () => {
    expect(
      projectEndpoints({ endpoints: [null, {}, { id: "x" }, "nope"] }),
    ).toEqual([])
    expect(projectEndpoints({})).toEqual([])
    expect(projectEndpoints(null)).toEqual([])
  })

  it("defaults a missing credential block to required:false, present:false", () => {
    const [entry] = projectEndpoints({
      endpoints: [
        { id: "local", model: "qwen3.6-27b", isDeploymentDefault: true },
      ],
    })

    expect(entry).toMatchObject({
      label: "local",
      provider: "unknown",
      contextWindowTokens: 0,
      isDeploymentDefault: true,
      credential: { required: false, present: false },
    })
    expect(entry?.baseUrl).toBeUndefined()
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
  it("emits rows an operator can paste under agent.presets", () => {
    expect(
      presetFixtureSnippet({
        id: "lmstudio-local",
        label: "LM Studio (local)",
        model: "qwen3.6-27b",
        baseUrl: "http://127.0.0.1:1234/v1",
        contextWindowTokens: 262_144,
      }),
    ).toBe(
      [
        '    - id: "lmstudio-local"',
        '      label: "LM Studio (local)"',
        '      provider: "openai-compatible"',
        '      model: "qwen3.6-27b"',
        '      baseUrl: "http://127.0.0.1:1234/v1"',
        "      contextWindowTokens: 262144",
      ].join("\n"),
    )
  })

  // The model id is whatever the probed server reported — remote data pasted
  // into a config file. Unquoted, a colon or a leading anchor character would
  // change the document's meaning.
  it("quotes a model id that would otherwise reshape the YAML", () => {
    const snippet = presetFixtureSnippet({
      id: "local",
      label: "Local",
      model: 'evil: true\n      registration: "open"',
      baseUrl: "http://127.0.0.1:1234/v1",
    })

    expect(snippet).toContain(
      '      model: "evil: true\\n      registration: \\"open\\""',
    )
    expect(snippet.split("\n")).toHaveLength(5)
  })

  it("omits the credential line when no variable was named", () => {
    expect(
      presetFixtureSnippet({
        id: "local",
        label: "Local",
        model: "a",
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    ).not.toContain("apiKeyEnv")
  })

  it("suggests a fixture-legal id from the endpoint and model", () => {
    expect(suggestPresetId("http://127.0.0.1:1234/v1", "qwen3.6-27b")).toBe(
      "127-0-0-1-qwen3-6-27b",
    )
    expect(suggestPresetId("not a url", "")).toBe("local")
  })
})
