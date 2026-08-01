import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import { MemoryUsageLedgerRepository } from "./usage-ledger"
import {
  createUsageEndpointRoutes,
  USAGE_RELAY_SECRET_HEADER,
  type UsageEndpointPayload,
} from "./usage-endpoints"

const AGENT: SigilAgentConfig = {
  model: "gpt-5.6-terra",
  providers: [
    {
      id: "codex",
      label: "Codex subscription",
      kind: "codex",
      models: [{ id: "luna", model: "gpt-5.6-luna", label: "GPT-5.6 Luna" }],
    },
  ],
}
const RELAY_SECRET = "worktree-binding-secret"

function route(
  options: Parameters<typeof createUsageEndpointRoutes>[3] = {},
  ledger: MemoryUsageLedgerRepository = new MemoryUsageLedgerRepository(),
) {
  const authenticate = async (request: Request) =>
    request.headers.get("authorization") === "Bearer good"
      ? ({ principalId: "someone" } as never)
      : null
  const [usage] = createUsageEndpointRoutes(
    authenticate,
    AGENT,
    ledger,
    options,
  )
  return { usage: usage!, ledger }
}

function call(
  handler: ReturnType<typeof route>["usage"],
  headers: Record<string, string>,
): Promise<Response> {
  const request = new Request("http://eve/sigil/v1/usage", { headers })
  return Promise.resolve(handler.handler(request, {} as never))
}

describe("usage endpoint route", () => {
  it("exposes a GET route under the sigil namespace", () => {
    const { usage } = route()
    expect(usage.method).toBe("GET")
    expect(usage.path).toBe("/sigil/v1/usage")
  })

  it("refuses an unauthenticated caller", async () => {
    const { usage } = route({ relaySecret: RELAY_SECRET })
    expect((await call(usage, {})).status).toBe(401)
  })

  it("refuses a caller that cannot prove it came from the web server", async () => {
    const { usage } = route({ relaySecret: RELAY_SECRET })
    const response = await call(usage, { authorization: "Bearer good" })
    expect(response.status).toBe(403)
  })

  it("refuses every caller when no relay secret is configured", async () => {
    const { usage } = route({})
    const response = await call(usage, {
      authorization: "Bearer good",
      [USAGE_RELAY_SECRET_HEADER]: "anything",
    })
    expect(response.status).toBe(403)
  })

  it("answers the ledger's current aggregates and known models when authorized", async () => {
    const ledger = new MemoryUsageLedgerRepository(
      () => "2026-08-01T00:00:00.000Z",
    )
    ledger.append({
      turnId: "turn-1",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "codex/luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
      isDeploymentDefault: false,
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    const { usage } = route({ relaySecret: RELAY_SECRET }, ledger)
    const response = await call(usage, {
      authorization: "Bearer good",
      [USAGE_RELAY_SECRET_HEADER]: RELAY_SECRET,
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as UsageEndpointPayload
    expect(payload.aggregates.app.turnCount).toBe(1)
    expect(payload.aggregates.byUser).toEqual([
      { key: "user-1", bucket: expect.objectContaining({ turnCount: 1 }) },
    ])
    expect(payload.models.map((model) => model.presetId)).toEqual([
      "deployment-default",
      "codex/luna",
    ])
  })
})
