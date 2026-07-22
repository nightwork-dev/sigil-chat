import { describe, expect, it, vi } from "vitest"

import { sendMagicLinkEmail } from "./magic-link-email.server"

describe("sendMagicLinkEmail", () => {
  it("sends a single-use sign-in link through the configured email service", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 202 }))

    await sendMagicLinkEmail(
      { apiKey: "resend-key", from: "Sigil <signin@example.test>" },
      {
        email: "david@example.test",
        url: "https://chat.example.test/api/auth/magic-link/verify?token=secret",
      },
      { fetcher, siteName: "Sigil Chat" },
    )

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
  })

  it("fails closed when delivery is not configured", async () => {
    await expect(
      sendMagicLinkEmail(
        undefined,
        { email: "david@example.test", url: "https://example.test/link" },
        { siteName: "Sigil Chat" },
      ),
    ).rejects.toThrow("RESEND_API_KEY")
  })
})
