import { describe, expect, it } from "vitest"

import type { SigilAgentConfig } from "@workspace/runtime-env/config"

import { buildUsageAppendInput } from "./usage-metering"

const AGENT: SigilAgentConfig = {
  model: "gpt-5.6-terra",
  providers: [
    {
      id: "codex",
      label: "Codex subscription",
      kind: "codex",
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 6 },
      models: [{ id: "luna", model: "gpt-5.6-luna", label: "GPT-5.6 Luna" }],
    },
  ],
}

function ctx(binding: unknown, principalId = "user-1") {
  return {
    session: {
      auth: {
        current: {
          principalId,
          attributes: {
            sigilExecutionBinding: JSON.stringify(binding),
          },
        },
        initiator: null,
      },
    },
  }
}

function stepCompleted(usage?: Record<string, number>) {
  return {
    data: {
      turnId: "turn-1",
      stepIndex: 0,
      ...(usage !== undefined ? { usage } : {}),
    },
  }
}

describe("buildUsageAppendInput", () => {
  it("attributes a bound-model turn to its preset, thread, and principal", () => {
    const event = stepCompleted({ inputTokens: 1_000_000, outputTokens: 500_000 })
    const binding = {
      applicationThreadId: "thread-1",
      model: { presetId: "codex/luna", provider: "codex", modelId: "gpt-5.6-luna" },
    }
    const result = buildUsageAppendInput(event, ctx(binding), AGENT)

    expect(result.kind).toBe("record")
    if (result.kind !== "record") return
    expect(result.input).toMatchObject({
      turnId: "turn-1",
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "codex/luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
      isDeploymentDefault: false,
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    })
    // Pricing came from the fixture preset, not the event.
    expect(result.input.pricing).toEqual({
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 6,
    })
  })

  it("attributes a no-binding turn to the deployment default", () => {
    const event = stepCompleted({ inputTokens: 10 })
    const binding = { applicationThreadId: "thread-2" }
    const result = buildUsageAppendInput(event, ctx(binding), AGENT)

    expect(result.kind).toBe("record")
    if (result.kind !== "record") return
    expect(result.input.presetId).toBe("deployment-default")
    expect(result.input.isDeploymentDefault).toBe(true)
    expect(result.input.provider).toBe("codex")
    expect(result.input.modelId).toBe("gpt-5.6-terra")
    // agent.model is a bare slug: no pricing to find.
    expect(result.input.pricing).toBeUndefined()
  })

  it("records a step with no usage as unreported input, not zero-filled", () => {
    const event = stepCompleted(undefined)
    const binding = { applicationThreadId: "thread-3" }
    const result = buildUsageAppendInput(event, ctx(binding), AGENT)

    expect(result.kind).toBe("record")
    if (result.kind !== "record") return
    expect(result.input.usage).toBeUndefined()
  })

  it("skips a session with no verified execution binding", () => {
    const event = stepCompleted({ inputTokens: 10 })
    const noBindingCtx = {
      session: { auth: { current: null, initiator: null } },
    }
    const result = buildUsageAppendInput(event, noBindingCtx, AGENT)
    expect(result).toEqual({
      kind: "skipped",
      reason: "no-verified-execution-binding",
    })
  })

  it("skips a session whose principal is missing even with a thread id", () => {
    const event = stepCompleted({ inputTokens: 10 })
    const anonymousCtx = {
      session: {
        auth: {
          current: {
            attributes: {
              sigilExecutionBinding: JSON.stringify({
                applicationThreadId: "thread-4",
              }),
            },
          },
          initiator: null,
        },
      },
    }
    const result = buildUsageAppendInput(event, anonymousCtx, AGENT)
    expect(result.kind).toBe("skipped")
  })

  it("falls back to the session initiator when the current caller has no attributes", () => {
    const event = stepCompleted({ inputTokens: 10 })
    const delegatedCtx = {
      session: {
        auth: {
          current: null,
          initiator: {
            principalId: "user-initiator",
            attributes: {
              sigilExecutionBinding: JSON.stringify({
                applicationThreadId: "thread-5",
              }),
            },
          },
        },
      },
    }
    const result = buildUsageAppendInput(event, delegatedCtx, AGENT)
    expect(result.kind).toBe("record")
    if (result.kind !== "record") return
    expect(result.input.principalId).toBe("user-initiator")
    expect(result.input.applicationThreadId).toBe("thread-5")
  })
})
