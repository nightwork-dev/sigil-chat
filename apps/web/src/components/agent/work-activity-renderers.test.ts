import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ToolRendererProps } from "@workspace/ui/components/tool-renderer-registry"

import {
  SandboxActivityRenderer,
  SubagentActivityRenderer,
  TodoActivityRenderer,
  WebResearchRenderer,
} from "./work-activity-renderers"

describe("work activity renderers", () => {
  it("renders Eve's structured session checklist rather than raw JSON", () => {
    const html = renderToStaticMarkup(
      createElement(
        TodoActivityRenderer,
        tool("todo", {
          counts: {
            cancelled: 0,
            completed: 1,
            in_progress: 1,
            pending: 0,
            total: 2,
          },
          todos: [
            {
              content: "Map the payload",
              priority: "high",
              status: "completed",
            },
            {
              content: "Render the activity",
              priority: "medium",
              status: "in_progress",
            },
          ],
        }),
      ),
    )

    expect(html).toContain("Session checklist")
    expect(html).toContain("Map the payload")
    expect(html).toContain("1 in progress")
    expect(html).not.toContain('"todos"')
  })

  it("falls back to the generic tool receipt for malformed todo output", () => {
    const html = renderToStaticMarkup(
      createElement(TodoActivityRenderer, tool("todo", { todos: "invalid" })),
    )

    expect(html).not.toContain("Session checklist")
    expect(html).toContain("todo")
  })

  it("renders the sandbox command result with its exit state", () => {
    const html = renderToStaticMarkup(
      createElement(
        SandboxActivityRenderer,
        tool(
          "bash",
          { exitCode: 0, stderr: "", stdout: "ready", truncated: false },
          { command: "pwd" },
        ),
      ),
    )

    expect(html).toContain("Sandbox command")
    expect(html).toContain("Exit 0")
    expect(html).toContain("pwd")
    expect(html).toContain("ready")
  })

  it("renders returned web sources and does not synthesize a citation", () => {
    const html = renderToStaticMarkup(
      createElement(
        WebResearchRenderer,
        tool(
          "web_search",
          {
            results: [
              {
                excerpt: "Official reference material.",
                title: "Reference",
                url: "https://example.test/reference",
              },
            ],
          },
          { query: "reference" },
        ),
      ),
    )

    expect(html).toContain("Web research")
    expect(html).toContain("Reference")
    expect(html).toContain("https://example.test/reference")
  })

  it("marks a delegate complete without claiming unavailable lifecycle details", () => {
    const html = renderToStaticMarkup(
      createElement(
        SubagentActivityRenderer,
        tool(
          "review-critic",
          { summary: "Ready for review." },
          {},
          "subagent-call",
        ),
      ),
    )

    expect(html).toContain("Delegated review")
    expect(html).toContain("review-critic")
    expect(html).toContain("not available in this chat transcript")
  })
})

function tool(
  name: string,
  output: unknown,
  input: unknown = {},
  kind: "tool-call" | "subagent-call" = "tool-call",
): ToolRendererProps {
  return {
    canRespond: true,
    onInputResponses: () => undefined,
    part: {
      id: `${name}:1`,
      input,
      kind,
      name,
      output,
      state: "output-available",
      type: "tool-call",
    },
  }
}
