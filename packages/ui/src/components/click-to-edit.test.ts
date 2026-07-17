// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ClickToEdit } from "./click-to-edit"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function setInputValue(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setValue?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("ClickToEdit", () => {
  it("keeps the input focused while typing and commits the complete draft on blur", async () => {
    const onCommit = vi.fn()

    await act(() => {
      root.render(React.createElement(ClickToEdit, { value: "Original", onCommit }))
    })

    const trigger = container.querySelector<HTMLElement>('[data-slot="click-to-edit"]')
    expect(trigger).not.toBeNull()

    await act(() => trigger?.click())

    const input = container.querySelector<HTMLInputElement>('[data-slot="click-to-edit-input"]')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)

    await act(() => {
      if (input) setInputValue(input, "multiple characters")
    })

    expect(input?.value).toBe("multiple characters")
    expect(document.activeElement).toBe(input)
    expect(onCommit).not.toHaveBeenCalled()

    await act(() => input?.blur())

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith("multiple characters")
  })

  it("commits once on Enter and cancels on Escape", async () => {
    const onCommit = vi.fn()

    await act(() => {
      root.render(React.createElement(ClickToEdit, { value: "Original", onCommit }))
    })

    await act(() => container.querySelector<HTMLElement>('[data-slot="click-to-edit"]')?.click())
    const enterInput = container.querySelector<HTMLInputElement>('[data-slot="click-to-edit-input"]')
    expect(enterInput).not.toBeNull()

    await act(() => {
      if (enterInput) {
        setInputValue(enterInput, "Committed once")
        enterInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      }
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith("Committed once")

    await act(() => container.querySelector<HTMLElement>('[data-slot="click-to-edit"]')?.click())
    const escapeInput = container.querySelector<HTMLInputElement>('[data-slot="click-to-edit-input"]')
    expect(escapeInput).not.toBeNull()

    await act(() => {
      if (escapeInput) {
        setInputValue(escapeInput, "Cancelled")
        escapeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      }
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
