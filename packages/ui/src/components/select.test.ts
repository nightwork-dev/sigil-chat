// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("Select", () => {
  it("displays the selected item's label instead of its raw value", async () => {
    const sessions = [
      { id: "019f6c4e-2b11-7763-bdbb-a2c15cf59a91", title: "Design review" },
      { id: "019f6c4e-6824-74ac-b301-b5a2f89eab8d", title: "Release planning" },
    ]

    await act(() => {
      root.render(
        React.createElement(
          Select,
          { defaultValue: sessions[0].id },
          React.createElement(
            SelectTrigger,
            null,
            React.createElement(SelectValue),
          ),
          React.createElement(
            SelectContent,
            null,
            React.createElement(
              React.Fragment,
              null,
              ...sessions.map((session) =>
                React.createElement(
                  SelectItem,
                  { key: session.id, value: session.id },
                  session.title,
                ),
              ),
            ),
          ),
        ),
      )
    })

    const value = container.querySelector('[data-slot="select-value"]')
    expect(value?.textContent).toBe("Design review")
    expect(value?.textContent).not.toContain(sessions[0].id)
  })

  it("updates the displayed label when a controlled value changes", async () => {
    function ApprovalSelect({ value }: { value: string }) {
      return React.createElement(
        Select,
        { value },
        React.createElement(
          SelectTrigger,
          null,
          React.createElement(SelectValue),
        ),
        React.createElement(
          SelectContent,
          null,
          React.createElement(SelectItem, { value: "ask" }, "Ask"),
          React.createElement(SelectItem, { value: "always" }, "Always allow"),
        ),
      )
    }

    await act(() =>
      root.render(React.createElement(ApprovalSelect, { value: "ask" })),
    )
    expect(
      container.querySelector('[data-slot="select-value"]')?.textContent,
    ).toBe("Ask")

    await act(() =>
      root.render(React.createElement(ApprovalSelect, { value: "always" })),
    )
    expect(
      container.querySelector('[data-slot="select-value"]')?.textContent,
    ).toBe("Always allow")
  })

  it("preserves explicit SelectValue content", async () => {
    await act(() => {
      root.render(
        React.createElement(
          Select,
          { defaultValue: "ask" },
          React.createElement(
            SelectTrigger,
            null,
            React.createElement(SelectValue, {
              children: () => "Custom selection",
            }),
          ),
          React.createElement(
            SelectContent,
            null,
            React.createElement(SelectItem, { value: "ask" }, "Ask"),
          ),
        ),
      )
    })

    expect(
      container.querySelector('[data-slot="select-value"]')?.textContent,
    ).toBe("Custom selection")
  })
})
