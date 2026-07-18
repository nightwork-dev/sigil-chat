import { createClient, type Client } from "@libsql/client"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthEnvironment } from "./env"
import { createSigilAuth } from "./server"

const clients: Client[] = []
const databases: Kysely<Record<string, unknown>>[] = []
const temporaryDirectories: string[] = []

async function createTestAuth(registrationOpen = false) {
  const directory = mkdtempSync(join(tmpdir(), "sigil-auth-server-"))
  temporaryDirectories.push(directory)
  const url = `file:${join(directory, "auth.db")}`
  const client = createClient({ url })
  const kysely = new Kysely<Record<string, unknown>>({
    dialect: new LibsqlDialect({ url }),
  })
  clients.push(client)
  databases.push(kysely)
  await client.executeMultiple(
    readFileSync(resolve("migrations/0001_better_auth.sql"), "utf8"),
  )

  const environment: AuthEnvironment = {
    baseUrl: "http://sigil-chat.localhost:1355",
    databaseUrl: url,
    isProduction: false,
    registrationOpen,
    secret: "test-secret-with-at-least-thirty-two-characters",
    trustedOrigins: ["http://sigil-chat.localhost:1355"],
  }
  return createSigilAuth({ client, environment, kysely })
}

function signUpRequest(username: string) {
  return new Request(
    "http://sigil-chat.localhost:1355/api/auth/sign-up/email",
    {
      body: JSON.stringify({
        email: `${username}@example.test`,
        name: username,
        password: "a-safe-password-value",
        username,
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://sigil-chat.localhost:1355",
      },
      method: "POST",
    },
  )
}

afterEach(async () => {
  for (const database of databases.splice(0)) await database.destroy()
  for (const client of clients.splice(0)) client.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("Better Auth registration boundary", () => {
  it("creates the first account as owner and rejects later closed registration", async () => {
    const auth = await createTestAuth()

    const ownerResponse = await auth.handler(signUpRequest("first-owner"))
    expect(ownerResponse.status).toBe(200)
    expect(await ownerResponse.json()).toMatchObject({
      user: { role: "owner", username: "first-owner" },
    })

    const memberResponse = await auth.handler(signUpRequest("later-member"))
    expect(memberResponse.status).toBe(403)
  })

  it("commits at most one owner under concurrent first-run submissions", async () => {
    const auth = await createTestAuth()

    const responses = await Promise.all([
      auth.handler(signUpRequest("first-owner")),
      auth.handler(signUpRequest("other-owner")),
    ])
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1)
  })
})
