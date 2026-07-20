import type { AgentToolCallPart } from "@zigil/agent-surface/contracts"
import { describe, expect, it } from "vitest"

import {
  getToolOutputData,
  registerToolRenderer,
  resolveToolRenderer,
  type ToolRenderer,
} from "./tool-renderer-registry"

const renderer: ToolRenderer = () => null

describe("tool renderer registry", () => {
  it("prefers an exact tool renderer and accepts an MCP-prefixed name", () => {
    registerToolRenderer("fixture-tool", renderer)

    expect(resolveToolRenderer(part("fixture-tool"))).toBe(renderer)
    expect(resolveToolRenderer(part("service__fixture-tool"))).toBe(renderer)
  })

  it("unwraps structured and JSON text tool output", () => {
    expect(
      getToolOutputData(
        part("structured", {
          structuredContent: { answer: 42 },
        }),
      ),
    ).toEqual({ answer: 42 })

    expect(
      getToolOutputData(
        part("text", {
          content: [{ type: "text", text: '{"answer":42}' }],
        }),
      ),
    ).toEqual({ answer: 42 })
  })
})

function part(name: string, output?: unknown): AgentToolCallPart {
  return {
    kind: "tool-call",
    name,
    state: "output-available",
    input: {},
    output,
  } as AgentToolCallPart
}
