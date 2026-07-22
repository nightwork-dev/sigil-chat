import { createClient } from "@libsql/client"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { describe, expect, it } from "vitest"

import type { AuthEnvironment } from "./env"
import { createSigilAuthOptions } from "./server"

const environment: AuthEnvironment = {
  baseUrl: "http://sigil-chat.localhost:1355",
  databaseUrl: ":memory:",
  installationId: "test-installation",
  isProduction: false,
  registrationOpen: false,
  secret: "test-secret-with-at-least-thirty-two-characters",
  socialProviders: {},
  trustedOrigins: ["http://sigil-chat.localhost:1355"],
}

describe("createSigilAuthOptions", () => {
  it("keeps the TanStack cookie adapter last and enables every-environment rate limiting", () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<Record<string, unknown>>({
      dialect: new LibsqlDialect({ url: ":memory:" }),
    })
    const options = createSigilAuthOptions({ client, environment, kysely })

    expect(options.rateLimit?.enabled).toBe(true)
    expect(options.account?.accountLinking?.requireLocalEmailVerified).toBe(
      false,
    )
    expect(options.disabledPaths).toContain("/is-username-available")
    expect(options.plugins?.at(-1)?.id).toBe("tanstack-start-cookies")

    const magicLinkPlugin = options.plugins?.find(
      (plugin) => plugin.id === "magic-link",
    )
    expect(magicLinkPlugin?.options).toMatchObject({
      disableSignUp: true,
      expiresIn: 15 * 60,
      storeToken: "hashed",
    })

    const jwtPlugin = options.plugins?.find((plugin) => plugin.id === "jwt")
    expect(jwtPlugin?.options).toMatchObject({
      jwt: {
        audience: "sigil-chat-agent",
        expirationTime: "5m",
        issuer: environment.baseUrl,
      },
    })

    client.close()
    void kysely.destroy()
  })

  it("requires local email verification when registration is open", () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<Record<string, unknown>>({
      dialect: new LibsqlDialect({ url: ":memory:" }),
    })
    const options = createSigilAuthOptions({
      client,
      environment: { ...environment, registrationOpen: true },
      kysely,
    })

    expect(options.account?.accountLinking?.requireLocalEmailVerified).toBe(
      true,
    )

    client.close()
    void kysely.destroy()
  })

  it("configures only available providers without allowing OAuth registration", () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<Record<string, unknown>>({
      dialect: new LibsqlDialect({ url: ":memory:" }),
    })
    const options = createSigilAuthOptions({
      client,
      environment: {
        ...environment,
        socialProviders: {
          discord: { clientId: "discord-id", clientSecret: "discord-secret" },
          google: { clientId: "google-id", clientSecret: "google-secret" },
          okta: {
            clientId: "okta-id",
            clientSecret: "okta-secret",
            issuer: "https://example.okta.com/oauth2/default",
          },
        },
      },
      kysely,
    })

    expect(options.socialProviders).toMatchObject({
      discord: { disableSignUp: true },
      google: { disableSignUp: true },
    })
    expect(options.socialProviders).not.toHaveProperty("github")

    const genericOAuthPlugin = options.plugins?.find(
      (plugin) => plugin.id === "generic-oauth",
    )
    expect(genericOAuthPlugin?.options).toMatchObject({
      config: [
        {
          disableSignUp: true,
          providerId: "okta",
          requireIssuerValidation: true,
        },
      ],
    })

    client.close()
    void kysely.destroy()
  })
})
