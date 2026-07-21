import { describe, expect, it } from "vitest"

import { DEFAULT_RETURN_TO, sanitizeReturnTo } from "./return-to"

describe("sanitizeReturnTo", () => {
  it("passes through a same-origin path with search and hash", () => {
    expect(sanitizeReturnTo("/demos/studio/foo?bar=1#baz")).toBe(
      "/demos/studio/foo?bar=1#baz",
    )
  })

  it("falls back for a missing or non-string value", () => {
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo(null)).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo(42)).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo("")).toBe(DEFAULT_RETURN_TO)
  })

  it("rejects a protocol-relative open-redirect (//evil.com)", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo("//evil.com/path")).toBe(DEFAULT_RETURN_TO)
  })

  it("rejects an absolute cross-origin URL", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo("http://evil.com/demos/studio")).toBe(
      DEFAULT_RETURN_TO,
    )
  })

  it("rejects a path that doesn't start with a single slash", () => {
    expect(sanitizeReturnTo("demos/studio")).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe(DEFAULT_RETURN_TO)
  })

  it("rejects backslash tricks browsers may normalize as scheme-relative", () => {
    expect(sanitizeReturnTo("/\\evil.com")).toBe(DEFAULT_RETURN_TO)
    expect(sanitizeReturnTo("\\\\evil.com")).toBe(DEFAULT_RETURN_TO)
  })

  it("respects a custom fallback", () => {
    expect(sanitizeReturnTo(undefined, "/login")).toBe("/login")
  })
})
