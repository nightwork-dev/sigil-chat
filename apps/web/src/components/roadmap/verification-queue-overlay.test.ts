import { describe, expect, it } from "vitest"

import { VERIFICATION_FEEDBACK_TEXTAREA_CLASS_NAME } from "./verification-queue-overlay"

describe("VerificationQueueOverlay feedback textarea", () => {
  it("keeps the mobile feedback font at the no-focus-zoom size", () => {
    const classes = VERIFICATION_FEEDBACK_TEXTAREA_CLASS_NAME.split(/\s+/)

    expect(classes).toContain("text-base")
    expect(classes).toContain("md:text-sm")
    expect(classes).not.toContain("text-sm")
  })
})
