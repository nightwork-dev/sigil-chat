import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import {
  createModelEndpointRoutes,
  MODEL_RELAY_SECRET_HEADER,
} from "./model-endpoints"

const AGENT: SigilAgentConfig = { model: "gpt-5.6-terra" }
const RELAY_SECRET = "worktree-binding-secret"

function refuseNetwork(): typeof fetch {
  return (async () => {
    throw new Error("the probe must not reach the network here")
  }) as unknown as typeof fetch
}

function routes(options: Parameters<typeof createModelEndpointRoutes>[2] = {}) {
  const authenticate = async (request: Request) =>
    request.headers.get("authorization") === "Bearer good"
      ? ({ principalId: "someone" } as never)
      : null
  const [inventory, probe] = createModelEndpointRoutes(
    authenticate,
    AGENT,
    options,
  )
  return { inventory: inventory!, probe: probe! }
}

function call(
  route: ReturnType<typeof routes>["inventory"],
  request: Request,
): Promise<Response> {
  return Promise.resolve(route.handler(request, {} as never))
}

function inventoryRequest(headers: Record<string, string>): Request {
  return new Request("http://eve/sigil/v1/model-endpoints", { headers })
}

function probeRequest(
  headers: Record<string, string>,
  body: string = JSON.stringify({ baseUrl: "http://127.0.0.1:1234/v1" }),
): Request {
  return new Request("http://eve/sigil/v1/model-endpoints/probe", {
    method: "POST",
    headers,
    body,
  })
}

describe("model endpoint routes", () => {
  it("exposes inventory and probe under the sigil namespace", () => {
    const { inventory, probe } = routes()
    expect(inventory.method).toBe("GET")
    expect(inventory.path).toBe("/sigil/v1/model-endpoints")
    expect(probe.method).toBe("POST")
    expect(probe.path).toBe("/sigil/v1/model-endpoints/probe")
  })

  it("refuses an unauthenticated caller on both routes", async () => {
    const { inventory, probe } = routes({ relaySecret: RELAY_SECRET })
    expect((await call(inventory, inventoryRequest({}))).status).toBe(401)
    expect((await call(probe, probeRequest({}))).status).toBe(401)
  })

  // REGRESSION (should-fix, Annika 2026-07-31): the inventory route used to
  // check authenticate() alone, so a member's own Eve bearer token read the
  // whole deployment's model and credential configuration directly — the
  // owner check lives in the web app and was simply bypassed. Both routes now
  // require proof the call came through that web app.
  it("refuses an authenticated caller that cannot prove it came from the web server", async () => {
    const { inventory, probe } = routes({
      relaySecret: RELAY_SECRET,
      fetch: refuseNetwork(),
    })
    const authOnly = { authorization: "Bearer good" }

    expect((await call(inventory, inventoryRequest(authOnly))).status).toBe(403)
    expect((await call(probe, probeRequest(authOnly))).status).toBe(403)

    const wrongSecret = {
      ...authOnly,
      [MODEL_RELAY_SECRET_HEADER]: "not-the-secret",
    }
    expect((await call(inventory, inventoryRequest(wrongSecret))).status).toBe(
      403,
    )
    expect((await call(probe, probeRequest(wrongSecret))).status).toBe(403)
  })

  it("disables both routes entirely when no binding secret is configured", async () => {
    const { inventory, probe } = routes({ fetch: refuseNetwork() })
    const headers = {
      authorization: "Bearer good",
      [MODEL_RELAY_SECRET_HEADER]: "",
    }

    expect((await call(inventory, inventoryRequest(headers))).status).toBe(403)
    expect((await call(probe, probeRequest(headers))).status).toBe(403)
  })

  it("answers inventory with presence only once the relay is proven", async () => {
    const { inventory } = routes({
      relaySecret: RELAY_SECRET,
      hasCodexModelAuth: async () => true,
    })
    const response = await call(
      inventory,
      inventoryRequest({
        authorization: "Bearer good",
        [MODEL_RELAY_SECRET_HEADER]: RELAY_SECRET,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      endpoints: [
        {
          id: "deployment-default",
          label: "gpt-5.6-terra (Codex subscription)",
          provider: "codex",
          model: "gpt-5.6-terra",
          contextWindowTokens: 200_000,
          isDeploymentDefault: true,
          credential: { required: true, present: true },
        },
      ],
    })
  })

  it("probes once the caller is authenticated and carries the secret", async () => {
    const { probe } = routes({
      relaySecret: RELAY_SECRET,
      env: {},
      fetch: async () => Response.json({ data: [{ id: "qwen3.6-27b" }] }),
    })

    const response = await call(
      probe,
      probeRequest({
        authorization: "Bearer good",
        [MODEL_RELAY_SECRET_HEADER]: RELAY_SECRET,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      reachable: true,
      models: ["qwen3.6-27b"],
    })
  })

  // REGRESSION (blocking, Annika 2026-07-31): the body used to carry
  // `apiKeyEnv`. A request still shaped that way must now be rejected
  // outright rather than silently ignored, so the removal is loud.
  it("rejects a probe body that tries to name a credential", async () => {
    const { probe } = routes({
      relaySecret: RELAY_SECRET,
      env: { SIGIL_MODEL_DEEPSEEK_API_KEY: "sk-live-secret" },
      fetch: refuseNetwork(),
    })

    const response = await call(
      probe,
      probeRequest(
        {
          authorization: "Bearer good",
          [MODEL_RELAY_SECRET_HEADER]: RELAY_SECRET,
        },
        JSON.stringify({
          baseUrl: "https://attacker.example/v1",
          apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
        }),
      ),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid-body" })
  })

  it("rejects a malformed probe body before touching the network", async () => {
    const { probe } = routes({
      relaySecret: RELAY_SECRET,
      fetch: refuseNetwork(),
    })

    for (const body of [
      "not json",
      JSON.stringify({}),
      JSON.stringify({ baseUrl: "   " }),
      JSON.stringify([{ baseUrl: "http://127.0.0.1:1234/v1" }]),
    ]) {
      const response = await call(
        probe,
        probeRequest(
          {
            authorization: "Bearer good",
            [MODEL_RELAY_SECRET_HEADER]: RELAY_SECRET,
          },
          body,
        ),
      )
      expect(response.status, body).toBe(400)
    }
  })
})
