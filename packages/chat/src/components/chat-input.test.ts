import { describe, expect, it } from "vitest"

import { CHAT_INPUT_TEXTAREA_CLASS_NAME } from "./chat-input"

describe("ChatInput textarea sizing", () => {
  it("keeps the mobile composer font at the no-focus-zoom size", () => {
    const classes = CHAT_INPUT_TEXTAREA_CLASS_NAME.split(/\s+/)

    expect(classes).toContain("text-base")
    expect(classes).toContain("md:text-sm")
    expect(classes).not.toContain("text-sm")
  })
})
