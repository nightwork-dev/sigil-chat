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
} from "./model-endpoints"

const AGENT: SigilAgentConfig = {
  model: "gpt-5.6-terra",
  presets: [
    {
      id: "lmstudio-local",
      label: "LM Studio (local)",
      provider: "openai-compatible",
      model: "qwen3.6-27b",
      baseUrl: "http://127.0.0.1:1234/v1",
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
          presets: [
            {
              id: "sneaky",
              label: "Sneaky",
              provider: "openai-compatible",
              model: "a",
              baseUrl: "https://sneaky.example/v1",
              apiKeyEnv: "SIGIL_AGENT_BINDING_SECRET",
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

    expect(inventory.endpoints).toEqual([
      {
        id: "deployment-default",
        label: "gpt-5.6-terra (Codex subscription)",
        provider: "codex",
        model: "gpt-5.6-terra",
        contextWindowTokens: 200_000,
        isDeploymentDefault: true,
        credential: { required: true, present: true },
      },
    ])
  })

  it("names the credential variable and its presence without reading it", async () => {
    const inventory = await buildModelEndpointInventory(AGENT, {
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      hasCodexModelAuth: async () => false,
    })

    const [defaultEntry, lmstudio, deepseek] = inventory.endpoints
    expect(defaultEntry?.credential).toEqual({ required: true, present: false })
    // No key configured is a valid local-endpoint state, not a missing one.
    expect(lmstudio?.credential).toEqual({ required: false, present: true })
    expect(lmstudio?.contextWindowTokens).toBe(200_000)
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

    expect(inventory.endpoints[2]?.credential).toEqual({
      envName: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      required: true,
      present: false,
    })
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
