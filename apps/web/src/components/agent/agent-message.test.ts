import { describe, expect, it } from "vitest"

import { parseTextAttachment } from "./agent-message"

describe("parseTextAttachment", () => {
  it("extracts the adapter's textual attachment envelope", () => {
    expect(
      parseTextAttachment(
        "Attached file: notes.md\n\n```\nfirst line\nsecond line\n```",
      ),
    ).toEqual({
      filename: "notes.md",
      body: "first line\nsecond line",
    })
  })

  it("does not consume ordinary prose that only mentions an attachment", () => {
    expect(parseTextAttachment("Attached file: notes.md")).toBeNull()
  })

  it("keeps fenced content inside the attachment body", () => {
    expect(
      parseTextAttachment(
        "Attached file: example.md\n\n```\nbefore\n```ts\ncode\n```\nafter\n```",
      ),
    ).toEqual({
      filename: "example.md",
      body: "before\n```ts\ncode\n```\nafter",
    })
  })
})
