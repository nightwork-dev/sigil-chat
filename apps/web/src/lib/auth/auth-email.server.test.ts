import { describe, expect, it, vi } from "vitest"

import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./auth-email.server"

const config = { apiKey: "resend-key", from: "Sigil <signin@example.test>" }
const message = {
  email: "david@example.test",
  url: "https://chat.example.test/auth-action?token=secret",
}

describe("auth email delivery", () => {
  it.each([
    [sendMagicLinkEmail, "Sign in to Sigil Chat"],
    [sendPasswordResetEmail, "Reset your Sigil Chat password"],
    [sendVerificationEmail, "Verify your email for Sigil Chat"],
  ])("sends the expected single-use auth message", async (sender, subject) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 202 }))

    await sender(config, message, { fetcher, siteName: "Sigil Chat" })

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
        }),
        method: "POST",
      }),
    )
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain("david@example.test")
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain("token=secret")
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain(subject)
  })

  it("fails closed when delivery is not configured", async () => {
    await expect(
      sendPasswordResetEmail(undefined, message, { siteName: "Sigil Chat" }),
    ).rejects.toThrow("RESEND_API_KEY")
  })
})
