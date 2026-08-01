import { describe, expect, it } from "vitest"

import { rejectCrossOrigin } from "./same-origin.server"

const post = (url: string, origin?: string) =>
  new Request(url, {
    method: "POST",
    headers: origin === undefined ? {} : { Origin: origin },
  })

describe("rejectCrossOrigin", () => {
  it("lets a same-origin request through", () => {
    expect(
      rejectCrossOrigin(
        post("http://sigil.test/api/voice/transcribe", "http://sigil.test"),
      ),
    ).toBeUndefined()
  })

  it("lets a request with no Origin through (curl, same-origin navigation)", () => {
    expect(
      rejectCrossOrigin(post("http://sigil.test/api/voice/transcribe")),
    ).toBeUndefined()
  })

  // Multipart POSTs skip preflight, so this refusal is the only thing keeping
  // a hostile page from spending the user's session against the backend.
  it.each([
    ["another host", "http://evil.test"],
    ["an opaque origin", "null"],
    ["a malformed origin", "not-a-url"],
  ])("refuses %s with 403", (_label, origin) => {
    const response = rejectCrossOrigin(
      post("http://sigil.test/api/voice/transcribe", origin),
    )
    expect(response?.status).toBe(403)
  })

  it("tolerates a scheme mismatch from TLS-terminating proxies", () => {
    expect(
      rejectCrossOrigin(post("http://sigil.test/api", "https://sigil.test")),
    ).toBeUndefined()
  })
})
