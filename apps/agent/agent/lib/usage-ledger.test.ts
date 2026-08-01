import { describe, expect, it } from "vitest"

import { MemoryUsageLedgerRepository } from "./usage-ledger"

function repo(now = "2026-08-01T12:00:00.000Z") {
  return new MemoryUsageLedgerRepository(() => now)
}

describe("MemoryUsageLedgerRepository.append", () => {
  it("records a reported turn with computed cost", () => {
    const ledger = repo()
    const record = ledger.append({
      turnId: "turn-1",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "codex/luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
      isDeploymentDefault: false,
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 6 },
    })

    expect(record.reported).toBe(true)
    // 1_000_000 tokens * $1/1M + 500_000 tokens * $6/1M = $1 + $3 = $4 = 4_000_000 micros
    expect(record.costMicros).toBe(4_000_000)
    expect(record.currency).toBe("usd")
    expect(record.recordedAt).toBe("2026-08-01T12:00:00.000Z")
  })

  it("records a turn with no usage as unreported, not zero-filled", () => {
    const ledger = repo()
    const record = ledger.append({
      turnId: "turn-2",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "deployment-default",
      provider: "codex",
      modelId: "gpt-5.6-terra",
      isDeploymentDefault: true,
    })

    expect(record.reported).toBe(false)
    expect(record.usage).toBeUndefined()
    expect(record.costMicros).toBeUndefined()
  })

  it("degrades to token counts without cost when pricing is absent", () => {
    const ledger = repo()
    const record = ledger.append({
      turnId: "turn-3",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "lmstudio-local/qwen",
      provider: "openai-compatible",
      modelId: "qwen3.6-27b",
      isDeploymentDefault: false,
      usage: { inputTokens: 200, outputTokens: 100 },
    })

    expect(record.reported).toBe(true)
    expect(record.usage).toEqual({ inputTokens: 200, outputTokens: 100 })
    expect(record.costMicros).toBeUndefined()
  })

  it("degrades to token counts when only one direction is priced", () => {
    const ledger = repo()
    const record = ledger.append({
      turnId: "turn-4",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "codex/luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
      isDeploymentDefault: false,
      usage: { inputTokens: 1_000_000 },
      pricing: { outputPerMillionTokens: 6 },
    })

    expect(record.costMicros).toBeUndefined()
  })
})

describe("MemoryUsageLedgerRepository.aggregates", () => {
  it("answers app, user, model, day, and session totals without a raw scan", () => {
    const ledger = repo("2026-08-01T09:00:00.000Z")
    ledger.append({
      turnId: "turn-1",
      stepIndex: 0,
      applicationThreadId: "thread-1",
      principalId: "user-1",
      presetId: "codex/luna",
      provider: "codex",
      modelId: "gpt-5.6-luna",
      isDeploymentDefault: false,
      usage: { inputTokens: 100, outputTokens: 50 },
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 6 },
    })
    ledger.append({
      turnId: "turn-2",
      stepIndex: 0,
      applicationThreadId: "thread-2",
      principalId: "user-2",
      presetId: "deployment-default",
      provider: "codex",
      modelId: "gpt-5.6-terra",
      isDeploymentDefault: true,
      usage: { inputTokens: 200, outputTokens: 0 },
    })

    const aggregates = ledger.aggregates()

    expect(aggregates.app.turnCount).toBe(2)
    expect(aggregates.app.reportedTurnCount).toBe(2)
    expect(aggregates.app.inputTokens).toBe(300)
    expect(aggregates.app.pricedTurnCount).toBe(1)
    // 100 * 1 + 50 * 6 = 100 + 300 = 400 micros
    expect(aggregates.app.costMicros).toBe(400)

    expect(aggregates.byUser).toEqual([
      { key: "user-1", bucket: expect.objectContaining({ turnCount: 1 }) },
      { key: "user-2", bucket: expect.objectContaining({ turnCount: 1 }) },
    ])
    expect(aggregates.byModel.map((entry) => entry.key)).toEqual([
      "codex/luna",
      "deployment-default",
    ])
    expect(aggregates.byDay).toEqual([
      {
        key: "2026-08-01",
        bucket: expect.objectContaining({ turnCount: 2 }),
      },
    ])
    expect(aggregates.bySession.map((entry) => entry.key)).toEqual([
      "thread-1",
      "thread-2",
    ])
  })

  it("keeps attribution unbroken across a runtime-session rotation", () => {
    // Two Eve sessions, same application thread — the durable "session" the
    // ledger keys on (criterion 5).
    const ledger = repo()
    ledger.append({
      turnId: "turn-a",
      stepIndex: 0,
      applicationThreadId: "thread-durable",
      principalId: "user-1",
      presetId: "deployment-default",
      provider: "codex",
      modelId: "gpt-5.6-terra",
      isDeploymentDefault: true,
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    ledger.append({
      turnId: "turn-b",
      stepIndex: 0,
      applicationThreadId: "thread-durable",
      principalId: "user-1",
      presetId: "deployment-default",
      provider: "codex",
      modelId: "gpt-5.6-terra",
      isDeploymentDefault: true,
      usage: { inputTokens: 20, outputTokens: 10 },
    })

    const aggregates = ledger.aggregates()
    expect(aggregates.bySession).toHaveLength(1)
    expect(aggregates.bySession[0]).toMatchObject({
      key: "thread-durable",
      bucket: { turnCount: 2, inputTokens: 30, outputTokens: 15 },
    })
  })
})
