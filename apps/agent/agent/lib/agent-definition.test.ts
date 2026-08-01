import { describe, expect, it } from "vitest"

import rootAgent from "../agent"
import reviewCritic from "../subagents/review-critic/agent"

/**
 * Eve records session- and turn-scoped dynamic model selections durably, so it
 * requires them to be SERIALIZABLE and rejects a resolver that returns a
 * provider object at those events — logging an error and discarding the
 * selection, which silently drops the session back to the compiled fallback.
 *
 * Our resolvers must return provider objects: a codex or LM Studio model is a
 * real AI SDK instance built from the fixture, not an AI Gateway model id.
 * `step.started` is the only scope where eve permits that, so registering the
 * resolver anywhere else turns per-session model selection into a silent no-op
 * that no unit test of the resolver itself would catch.
 */
const AGENTS = [
  ["root", rootAgent],
  ["review-critic", reviewCritic],
] as const

describe("dynamic model event scope", () => {
  it.each(AGENTS)("%s resolves its model at step scope only", (_name, agent) => {
    const model = agent.model as { kind?: string; events?: Record<string, unknown> }

    expect(model.kind).toBe("eve:dynamic")
    expect(Object.keys(model.events ?? {})).toEqual(["step.started"])
  })

  it.each(AGENTS)("%s keeps a static compiled fallback", (_name, agent) => {
    const model = agent.model as { fallback?: unknown }
    expect(model.fallback).toBeDefined()
  })
})
