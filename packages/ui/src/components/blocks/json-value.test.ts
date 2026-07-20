import { describe, expect, it } from "vitest"

import { formatJsonValue } from "./json-value"

describe("formatJsonValue", () => {
  it("formats JSON-compatible values and preserves strings", () => {
    expect(formatJsonValue({ answer: 42 })).toBe('{\n  "answer": 42\n}')
    expect(formatJsonValue("plain text")).toBe("plain text")
    expect(formatJsonValue(undefined)).toBe("")
  })

  it("falls back for cyclic values", () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(formatJsonValue(cyclic)).toBe("[object Object]")
  })
})
