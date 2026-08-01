import { describe, expect, it } from "vitest"

import { projectUsagePayload } from "./usage.server"

describe("projectUsagePayload", () => {
  it("projects a well-formed Eve response", () => {
    const payload = projectUsagePayload({
      generatedAt: "2026-08-01T00:00:00.000Z",
      models: [
        {
          presetId: "codex/luna",
          label: "GPT-5.6 Luna",
          provider: "codex",
          modelId: "gpt-5.6-luna",
          isDeploymentDefault: false,
        },
      ],
      aggregates: {
        app: {
          turnCount: 3,
          reportedTurnCount: 3,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          pricedTurnCount: 2,
          costMicros: 400,
        },
        byUser: [
          {
            key: "user-1",
            bucket: {
              turnCount: 3,
              reportedTurnCount: 3,
              inputTokens: 100,
              outputTokens: 50,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              pricedTurnCount: 2,
              costMicros: 400,
            },
          },
        ],
        byModel: [],
        byDay: [],
        bySession: [],
      },
    })

    expect(payload.models).toHaveLength(1)
    expect(payload.models[0]).toMatchObject({
      presetId: "codex/luna",
      provider: "codex",
    })
    expect(payload.aggregates.app.turnCount).toBe(3)
    expect(payload.aggregates.app.costMicros).toBe(400)
    expect(payload.aggregates.byUser[0]).toMatchObject({
      key: "user-1",
      bucket: { turnCount: 3 },
    })
  })

  it("degrades to an empty payload for an unreadable response", () => {
    const payload = projectUsagePayload(null)
    expect(payload.models).toEqual([])
    expect(payload.aggregates.app.turnCount).toBe(0)
    expect(payload.aggregates.byUser).toEqual([])
  })

  it("drops entries and model rows missing their identifying key", () => {
    const payload = projectUsagePayload({
      models: [{ label: "no id" }],
      aggregates: {
        byUser: [{ bucket: {} }],
        byModel: [],
        byDay: [],
        bySession: [],
      },
    })
    expect(payload.models).toEqual([])
    expect(payload.aggregates.byUser).toEqual([])
  })
})
