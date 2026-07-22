import { describe, expect, it } from "vitest"

import { resolveLoginMethods } from "./login-methods"

describe("resolveLoginMethods", () => {
  it("returns only methods backed by complete server configuration", () => {
    expect(
      resolveLoginMethods({
        authEmail: {
          apiKey: "resend-key",
          from: "Sigil <signin@example.test>",
        },
        socialProviders: {
          github: { clientId: "github-id", clientSecret: "github-secret" },
          okta: {
            clientId: "okta-id",
            clientSecret: "okta-secret",
            issuer: "https://example.okta.com/oauth2/default",
          },
        },
      }),
    ).toEqual({
      authEmailAvailable: true,
      magicLinkAvailable: true,
      socialProviderIds: ["okta", "github"],
    })
  })
})
