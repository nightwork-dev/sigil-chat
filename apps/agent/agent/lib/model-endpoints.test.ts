import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import {
  buildModelEndpointInventory,
  checkProbeUrl,
  isDeniedProbeHostname,
  modelCatalogUrl,
  probeModelEndpoint,
  readModelIds,
  resolveProbeCredentialEnv,
  slugifyModelId,
} from "./model-endpoints"

const AGENT: SigilAgentConfig = {
  model: "gpt-5.6-terra",
  providers: [
    {
      id: "lmstudio-local",
      label: "LM Studio (local)",
      kind: "openai-compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
      models: [{ id: "qwen", model: "qwen3.6-27b" }],
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      kind: "openai-compatible",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      contextWindowTokens: 65_536,
      models: [{ id: "chat", model: "deepseek-chat" }],
    },
  ],
}

function refuseNetwork(): typeof fetch {
  return (async () => {
    throw new Error("the probe must not reach the network here")
  }) as unknown as typeof fetch
}

describe("model catalog URL", () => {
  it("appends /models when the base URL already carries a version segment", () => {
    expect(modelCatalogUrl("http://127.0.0.1:1234/v1")).toBe(
      "http://127.0.0.1:1234/v1/models",
    )
    expect(modelCatalogUrl("https://api.deepseek.com/v1/")).toBe(
      "https://api.deepseek.com/v1/models",
    )
  })

  it("adds the version segment when the operator pasted a bare origin", () => {
    expect(modelCatalogUrl("http://127.0.0.1:1234")).toBe(
      "http://127.0.0.1:1234/v1/models",
    )
  })

  // REGRESSION (blocking, Annika 2026-07-31): the previous implementation
  // concatenated strings, so a trailing "#" made everything after it the
  // request path rather than a fragment — arbitrary-path GET against any host.
  // Assigning pathname on a URL object is what makes that inexpressible.
  it("cannot be steered by a fragment or query in the base URL", () => {
    expect(modelCatalogUrl("http://169.254.169.254/latest/meta-data/#")).toBe(
      "http://169.254.169.254/latest/meta-data/v1/models",
    )
    expect(modelCatalogUrl("http://127.0.0.1:1234/v1?x=1")).toBe(
      "http://127.0.0.1:1234/v1/models",
    )
  })
})

describe("probe URL check", () => {
  it("accepts an ordinary local or hosted base URL", () => {
    expect(checkProbeUrl("http://127.0.0.1:1234/v1").ok).toBe(true)
    expect(checkProbeUrl("https://api.deepseek.com/v1").ok).toBe(true)
    // Loopback and RFC1918 stay reachable on purpose.
    expect(checkProbeUrl("http://192.168.1.50:11434/v1").ok).toBe(true)
    expect(checkProbeUrl("http://[::1]:1234/v1").ok).toBe(true)
  })

  it("refuses a URL that carries a fragment, query, or credentials", () => {
    expect(checkProbeUrl("http://127.0.0.1:1234/v1#/latest/meta-data")).toEqual({
      ok: false,
      reason: "Base URL must not carry a query string or fragment.",
    })
    expect(checkProbeUrl("http://127.0.0.1:1234/v1?a=b")).toMatchObject({
      ok: false,
    })
    expect(checkProbeUrl("http://user:pass@127.0.0.1:1234/v1")).toEqual({
      ok: false,
      reason: "Base URL must not embed credentials.",
    })
  })

  it("refuses non-http schemes", () => {
    expect(checkProbeUrl("file:///etc/passwd").ok).toBe(false)
    expect(checkProbeUrl("gopher://127.0.0.1:1234/").ok).toBe(false)
    expect(checkProbeUrl("not a url").ok).toBe(false)
  })

  it("refuses link-local and metadata targets in every spelling", () => {
    for (const host of [
      "169.254.169.254",
      "169.254.0.1",
      "2852039166",
      "metadata.google.internal",
      "[fe80::1]",
      "[fd00:ec2::254]",
      "[::ffff:169.254.169.254]",
      "[::ffff:a9fe:a9fe]",
    ]) {
      expect(isDeniedProbeHostname(host), host).toBe(true)
    }
    expect(checkProbeUrl("http://169.254.169.254/v1")).toEqual({
      ok: false,
      reason: "Base URL targets a link-local or metadata address.",
    })
  })

  it("does not deny ordinary hosts that merely look link-local-ish", () => {
    for (const host of [
      "127.0.0.1",
      "192.168.1.50",
      "10.0.0.5",
      "api.deepseek.com",
      "fe80.example.com",
      "fd-models.internal",
      "::1",
    ]) {
      expect(isDeniedProbeHostname(host), host).toBe(false)
    }
  })
})

describe("probe credential resolution", () => {
  it("lends a preset's credential only to its own origin", () => {
    expect(
      resolveProbeCredentialEnv(AGENT, new URL("https://api.deepseek.com/v1")),
    ).toBe("SIGIL_MODEL_DEEPSEEK_API_KEY")
    // Same host, different scheme is a different origin.
    expect(
      resolveProbeCredentialEnv(AGENT, new URL("http://api.deepseek.com/v1")),
    ).toBeUndefined()
    expect(
      resolveProbeCredentialEnv(AGENT, new URL("https://evil.example/v1")),
    ).toBeUndefined()
    // A preset with no credential lends nothing.
    expect(
      resolveProbeCredentialEnv(AGENT, new URL("http://127.0.0.1:1234/v1")),
    ).toBeUndefined()
  })

  it("ignores a fixture credential whose name escapes the model prefix", () => {
    expect(
      resolveProbeCredentialEnv(
        {
          model: "gpt-5.6-terra",
          providers: [
            {
              id: "sneaky",
              label: "Sneaky",
              kind: "openai-compatible",
              baseUrl: "https://sneaky.example/v1",
              apiKeyEnv: "SIGIL_AGENT_BINDING_SECRET",
              models: [{ id: "a", model: "a" }],
            },
          ],
        },
        new URL("https://sneaky.example/v1"),
      ),
    ).toBeUndefined()
  })
})

describe("model endpoint inventory", () => {
  it("reports the deployment default when no presets are authored", async () => {
    const inventory = await buildModelEndpointInventory(
      { model: "gpt-5.6-terra" },
      { hasCodexModelAuth: async () => true },
    )

    expect(inventory.providers).toEqual([
      {
        id: "deployment",
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
    ])
  })

  it("names the credential variable and its presence without reading it", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => false,
    })

    const [defaultEntry, lmstudio, deepseek] = inventory.providers
    expect(defaultEntry?.credential).toEqual({ required: true, present: false })
    // No key configured is a valid local-endpoint state, not a missing one.
    expect(lmstudio?.credential).toEqual({ required: false, present: true })
    expect(lmstudio?.models[0]?.contextWindowTokens).toBe(200_000)
    expect(lmstudio?.models[0]?.id).toBe("lmstudio-local/qwen")
    expect(deepseek?.credential).toEqual({
      envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      required: true,
      present: true,
    })
    expect(JSON.stringify(inventory)).not.toContain("sk-live-secret")
  })

  it("marks an unset hosted credential as missing", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: {},
      hasCodexModelAuth: async () => true,
    })

    expect(inventory.providers[2]?.credential).toEqual({
      envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      required: true,
      present: false,
    })
  })
})

describe("model catalog discovery", () => {
  it("does nothing when discovery is not requested — the default", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => true,
      fetch: refuseNetwork(),
    })
    // No `discoverCatalogs: true` — a fetch would throw, so reaching this
    // line at all proves discovery never touched the network.
    expect(inventory.providers[1]?.catalog).toBeUndefined()
    expect(inventory.providers[1]?.models).toHaveLength(1)
  })

  it("appends a served model the fixture did not author, disabled like any other new model", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: {},
      hasCodexModelAuth: async () => true,
      discoverCatalogs: true,
      fetch: async (input) => {
        expect(String(input)).toBe("http://127.0.0.1:1234/v1/models")
        return Response.json({
          data: [{ id: "qwen3.6-27b" }, { id: "gemma-3-27b-it" }],
        })
      },
    })

    const lmstudio = inventory.providers[1]
    expect(lmstudio?.catalog).toMatchObject({ checkedAt: expect.any(String) })
    // "qwen3.6-27b" is already authored under id "qwen" — discovery must not
    // duplicate it, only add what is genuinely new.
    expect(lmstudio?.models).toEqual([
      {
        id: "lmstudio-local/qwen",
        label: "qwen3.6-27b",
        model: "qwen3.6-27b",
        capability: "chat",
        enabled: true,
        contextWindowTokens: 200_000,
        isDeploymentDefault: false,
      },
      {
        id: "lmstudio-local/gemma-3-27b-it",
        label: "gemma-3-27b-it",
        model: "gemma-3-27b-it",
        capability: "chat",
        enabled: true,
        contextWindowTokens: 200_000,
        isDeploymentDefault: false,
        discovered: true,
      },
    ])
  })

  it("slugifies a served model id that would not survive the allow-list's id grammar", async () => {
    expect(slugifyModelId("Qwen3.6-27B")).toBe("qwen3-6-27b")
    expect(slugifyModelId("moonshotai/kimi-k2:free")).toBe(
      "moonshotai-kimi-k2-free",
    )

    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => true,
      discoverCatalogs: true,
      fetch: async (input) => {
        if (String(input).includes("deepseek")) {
          return Response.json({ data: [{ id: "deepseek-chat" }] })
        }
        return Response.json({ data: [{ id: "moonshotai/kimi-k2:free" }] })
      },
    })

    const discovered = inventory.providers[1]?.models.find(
      (model) => model.discovered,
    )
    expect(discovered?.id).toBe("lmstudio-local/moonshotai-kimi-k2-free")
    expect(discovered?.model).toBe("moonshotai/kimi-k2:free")
  })

  it("disambiguates two served ids that would collide on the same slug", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => true,
      discoverCatalogs: true,
      fetch: async (input) => {
        if (String(input).includes("deepseek")) {
          return Response.json({ data: [{ id: "deepseek-chat" }] })
        }
        return Response.json({ data: [{ id: "Model X" }, { id: "model x" }] })
      },
    })

    const discoveredIds = inventory.providers[1]?.models
      .filter((model) => model.discovered)
      .map((model) => model.id)
    expect(discoveredIds).toEqual([
      "lmstudio-local/model-x",
      "lmstudio-local/model-x-2",
    ])
  })

  it("surfaces a catalog failure honestly instead of silently keeping quiet", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => true,
      discoverCatalogs: true,
      fetch: async (input) => {
        if (String(input).includes("deepseek")) {
          return Response.json({ data: [{ id: "deepseek-chat" }] })
        }
        throw new Error("ECONNREFUSED")
      },
    })

    const lmstudio = inventory.providers[1]
    expect(lmstudio?.catalog?.error).toContain("No response")
    // The authored model stands even though discovery failed.
    expect(lmstudio?.models).toHaveLength(1)
  })

  // SSRF regression: discovery must go through the SAME hardened path as the
  // operator probe — manual redirects, the checkProbeUrl gate — rather than a
  // second, less careful implementation. A provider's baseUrl is authored
  // (trusted) rather than caller-supplied, but a redirect response is still
  // attacker-influenced if the endpoint is ever compromised, so the same
  // "never follow" rule applies.
  it("treats a catalog redirect as unreachable rather than following it", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => true,
      discoverCatalogs: true,
      fetch: async (input, init) => {
        if (String(input).includes("deepseek")) {
          return Response.json({ data: [{ id: "deepseek-chat" }] })
        }
        expect(init?.redirect).toBe("manual")
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        })
      },
    })

    expect(inventory.providers[1]?.catalog?.error).toContain("redirected")
    expect(inventory.providers[1]?.models).toHaveLength(1)
  })

  it("never attempts discovery for a provider with no baseUrl (codex) or the fixture disabled", async () => {
    const inventory = await buildModelEndpointInventory(
      {
        model: "gpt-5.6-terra",
        providers: [
          {
            id: "retired",
            label: "Retired",
            kind: "openai-compatible",
            baseUrl: "http://127.0.0.1:9/v1",
            enabled: false,
            models: [{ id: "a", model: "a" }],
          },
        ],
      },
      {
        hasCodexModelAuth: async () => true,
        discoverCatalogs: true,
        fetch: refuseNetwork(),
      },
    )

    // Reaching this line at all proves neither provider hit the network.
    expect(inventory.providers[0]?.catalog).toBeUndefined()
    expect(inventory.providers[1]?.catalog).toBeUndefined()
  })
})

describe("model endpoint probe", () => {
  it("reports the served model list when the endpoint answers", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "http://127.0.0.1:1234/v1" },
      {
        agent: AGENT,
        env: {},
        fetch: async (input, init) => {
          expect(String(input)).toBe("http://127.0.0.1:1234/v1/models")
          expect(new Headers(init?.headers).get("authorization")).toBeNull()
          return Response.json({
            data: [{ id: "qwen3.6-27b" }, { id: "nomic-embed-text" }],
          })
        },
      },
    )

    expect(result).toEqual({
      reachable: true,
      status: 200,
      models: ["qwen3.6-27b", "nomic-embed-text"],
      credential: { present: false },
    })
  })

  it("attaches the fixture credential for its own origin without returning it", async () => {
    let sentAuthorization: string | null = null
    const result = await probeModelEndpoint(
      { baseUrl: "https://api.deepseek.com/v1" },
      {
        agent: AGENT,
        env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
        fetch: async (_input, init) => {
          sentAuthorization =
            new Headers(init?.headers).get("authorization") ?? null
          return Response.json({ data: [{ id: "deepseek-chat" }] })
        },
      },
    )

    expect(sentAuthorization).toBe("Bearer sk-live-secret")
    expect(result.credential).toEqual({
      envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      present: true,
    })
    expect(JSON.stringify(result)).not.toContain("sk-live-secret")
  })

  // REGRESSION (blocking, Annika 2026-07-31): the probe used to take
  // `apiKeyEnv` from the request, so a caller could aim a configured
  // credential at a host of its choosing. The input type no longer carries
  // that field; this proves the runtime behaviour matches — a credential
  // travels to the origin the fixture assigned it to and nowhere else.
  it("never sends a credential to an origin the fixture did not assign it to", async () => {
    let sentAuthorization: string | null = null
    const result = await probeModelEndpoint(
      // A caller-shaped object carrying the field the old API accepted.
      {
        baseUrl: "https://attacker.example/v1",
        apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      } as never,
      {
        agent: AGENT,
        env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
        fetch: async (_input, init) => {
          sentAuthorization =
            new Headers(init?.headers).get("authorization") ?? null
          return Response.json({ data: [] })
        },
      },
    )

    expect(sentAuthorization).toBeNull()
    expect(result.credential).toEqual({ present: false })
    expect(JSON.stringify(result)).not.toContain("sk-live-secret")
  })

  // Host here is deliberately benign so this isolates the fragment rule; the
  // link-local rule has its own case below, and modelCatalogUrl's own test
  // covers what the fragment used to do to the request path.
  it("refuses a fragment-steered URL before touching the network", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "http://127.0.0.1:1234/v1#/latest/meta-data" },
      { agent: AGENT, env: {}, fetch: refuseNetwork() },
    )

    expect(result.reachable).toBe(false)
    expect(result.models).toEqual([])
    expect(result.error).toBe(
      "Base URL must not carry a query string or fragment.",
    )
  })

  it("refuses a link-local target before touching the network", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "http://169.254.169.254/v1" },
      { agent: AGENT, env: {}, fetch: refuseNetwork() },
    )

    expect(result.reachable).toBe(false)
    expect(result.error).toBe(
      "Base URL targets a link-local or metadata address.",
    )
  })

  it("rejects a non-http base URL before touching the network", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "file:///etc/passwd" },
      { agent: AGENT, env: {}, fetch: refuseNetwork() },
    )

    expect(result.reachable).toBe(false)
    expect(result.error).toBe("Base URL must be an http(s) URL.")
  })

  it("treats a redirect as unreachable rather than following it", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "https://api.deepseek.com/v1" },
      {
        agent: AGENT,
        env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
        fetch: async (_input, init) => {
          expect(init?.redirect).toBe("manual")
          return new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          })
        },
      },
    )

    expect(result).toMatchObject({
      reachable: false,
      status: 302,
      models: [],
      error:
        "The endpoint redirected. Probe the address it redirects to directly.",
    })
  })

  it("separates a rejected credential from an unreachable host", async () => {
    const rejected = await probeModelEndpoint(
      { baseUrl: "https://api.deepseek.com/v1" },
      {
        agent: AGENT,
        env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "wrong" },
        fetch: async () => Response.json({ error: "no" }, { status: 401 }),
      },
    )
    expect(rejected).toMatchObject({
      reachable: false,
      status: 401,
      error: "The endpoint rejected the credential.",
    })

    const unreachable = await probeModelEndpoint(
      { baseUrl: "http://127.0.0.1:9/v1" },
      {
        agent: AGENT,
        env: {},
        fetch: async () => {
          throw new TypeError("connection refused")
        },
      },
    )
    expect(unreachable.reachable).toBe(false)
    expect(unreachable.status).toBeUndefined()
    expect(unreachable.error).toMatch(/No response/)
  })

  it("survives an endpoint that answers with something other than a model list", async () => {
    const result = await probeModelEndpoint(
      { baseUrl: "http://127.0.0.1:1234/v1" },
      {
        agent: AGENT,
        env: {},
        fetch: async () => new Response("<html>", { status: 200 }),
      },
    )

    expect(result).toMatchObject({
      reachable: false,
      status: 200,
      error: "The endpoint answered, but not with JSON.",
    })
  })
})

describe("model id projection", () => {
  it("keeps well-formed ids and drops everything else", () => {
    expect(
      readModelIds({
        data: [{ id: "a" }, { id: "" }, { id: 4 }, null, "b", { id: "c" }],
      }),
    ).toEqual(["a", "c"])
    expect(readModelIds({ data: "nope" })).toEqual([])
    expect(readModelIds(null)).toEqual([])
  })
})
