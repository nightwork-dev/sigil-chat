import { createClient } from "@libsql/client"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { describe, expect, it } from "vitest"

import type { AuthEnvironment } from "./env"
import { createSigilAuthOptions } from "./server"

const environment: AuthEnvironment = {
  baseUrl: "http://sigil-chat.localhost:1355",
  databaseUrl: ":memory:",
  isProduction: false,
  registrationOpen: false,
  secret: "test-secret-with-at-least-thirty-two-characters",
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
    expect(options.disabledPaths).toContain("/is-username-available")
    expect(options.plugins?.at(-1)?.id).toBe("tanstack-start-cookies")

    client.close()
    void kysely.destroy()
  })
})
