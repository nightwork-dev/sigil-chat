import { describe, expect, it } from "vitest"

import { loginErrorFeedback } from "./login-feedback"

describe("loginErrorFeedback", () => {
  it("distinguishes a rate-limit cooldown from invalid credentials", () => {
    expect(loginErrorFeedback(429, "password").message).toBe(
      "Too many sign-in attempts. Wait one minute, then try again.",
    )
    expect(loginErrorFeedback(401, "password").message).toBe(
      "Incorrect email or password.",
    )
  })

  it("does not describe email-delivery failures as bad passwords", () => {
    expect(loginErrorFeedback(500, "magic-link").message).toContain(
      "send a sign-in link",
    )
  })
})
