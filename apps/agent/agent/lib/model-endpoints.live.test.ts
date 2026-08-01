import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import { probeModelEndpoint } from "./model-endpoints"

// Live smoke for the endpoint probe against a real OpenAI-compatible server
// (Ollama, LM Studio, vLLM, llama.cpp). Skipped unless set:
//   SIGIL_LOCAL_MODEL_BASE_URL  e.g. http://127.0.0.1:1234/v1
//   SIGIL_LOCAL_MODEL_ID        optional; asserted to appear in the catalog
//
// This is the counterpart to model-provider.live.test.ts: that one proves a
// real generation, this one proves the settings surface's reachability answer
// comes from a real server rather than a shaped fixture.
const baseUrl = process.env.SIGIL_LOCAL_MODEL_BASE_URL
const modelId = process.env.SIGIL_LOCAL_MODEL_ID

const agent: SigilAgentConfig = { model: "gpt-5.6-terra" }

describe.skipIf(!baseUrl)("local endpoint probe (live)", () => {
  it("reports the endpoint as reachable and lists what it serves", async () => {
    const result = await probeModelEndpoint({ baseUrl: baseUrl! }, { agent })

    expect(result.reachable).toBe(true)
    expect(result.status).toBe(200)
    expect(result.models.length).toBeGreaterThan(0)
    if (modelId) expect(result.models).toContain(modelId)
    // No preset claims this origin in the test's agent config, so the probe
    // goes unauthenticated — the ordinary local-server case.
    expect(result.credential).toEqual({ present: false })
  }, 30_000)

  it("reports an unreachable neighbour on the same host as unreachable", async () => {
    const closedPort = new URL(baseUrl!)
    closedPort.port = "9"
    const result = await probeModelEndpoint(
      { baseUrl: closedPort.toString() },
      { agent },
    )

    expect(result.reachable).toBe(false)
    expect(result.models).toEqual([])
  }, 30_000)
})
