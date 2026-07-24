import { describe, expect, it } from "vitest"

import { isAtWordBoundary } from "./mention-trigger"

describe("isAtWordBoundary", () => {
  it("is true at the very start of the text", () => {
    expect(isAtWordBoundary("", 0)).toBe(true)
  })

  it("is true right after whitespace", () => {
    expect(isAtWordBoundary("hello ", 6)).toBe(true)
    expect(isAtWordBoundary("hello\n", 6)).toBe(true)
    expect(isAtWordBoundary("hello\t", 6)).toBe(true)
  })

  it("is false mid-word", () => {
    expect(isAtWordBoundary("hello", 5)).toBe(false)
    expect(isAtWordBoundary("contact me at foo", 18)).toBe(false)
  })

  it("does not hijack an email-shaped mid-word position", () => {
    expect(isAtWordBoundary("me@example.com", 2)).toBe(false)
  })
})
