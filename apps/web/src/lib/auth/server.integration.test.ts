import { createClient, type Client } from "@libsql/client"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AuthEnvironment } from "./env"
import { createSigilAuth } from "./server"

const clients: Client[] = []
const databases: Kysely<Record<string, unknown>>[] = []
const temporaryDirectories: string[] = []

async function createTestAuth(
  registrationOpen = false,
  authEmail?: AuthEnvironment["authEmail"],
) {
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
    authEmail,
    baseUrl: "http://sigil-chat.localhost:1355",
    databaseUrl: url,
    installationId: "test-installation",
    isProduction: false,
    registrationOpen,
    secret: "test-secret-with-at-least-thirty-two-characters",
    socialProviders: {},
    trustedOrigins: ["http://sigil-chat.localhost:1355"],
  }
  return createSigilAuth({ client, environment, kysely })
}

function signUpRequest(username: string, ipAddress = "192.0.2.1") {
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
        "x-forwarded-for": ipAddress,
      },
      method: "POST",
    },
  )
}

afterEach(async () => {
  vi.unstubAllGlobals()
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
      auth.handler(signUpRequest("first-owner", "192.0.2.2")),
      auth.handler(signUpRequest("other-owner", "192.0.2.2")),
    ])
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1)
  })

  it("mints an Eve-audience token with only verified service claims and a five-minute lifetime", async () => {
    const auth = await createTestAuth()
    const ownerResponse = await auth.handler(
      signUpRequest("first-owner", "192.0.2.3"),
    )
    expect(ownerResponse.status).toBe(200)
    const cookie = ownerResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ")

    const tokenResponse = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/token", {
        headers: { cookie },
      }),
    )
    expect(tokenResponse.status).toBe(200)
    const { token } = (await tokenResponse.json()) as { token: string }
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>

    expect(payload).toMatchObject({
      aud: "sigil-chat-agent",
      installationId: "test-installation",
      iss: "http://sigil-chat.localhost:1355",
      role: "owner",
    })
    expect(payload).not.toHaveProperty("email")
    expect(payload).not.toHaveProperty("name")
    expect(typeof payload.sub).toBe("string")
    expect((payload.exp as number) - (payload.iat as number)).toBe(300)
  })

  it("rejects an anonymous Eve token request", async () => {
    const auth = await createTestAuth()
    const response = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/token"),
    )

    expect(response.status).toBe(401)
  })

  it("resets a password through a single-use email token and revokes the existing session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetcher)
    const auth = await createTestAuth(false, {
      apiKey: "resend-key",
      from: "Sigil <signin@example.test>",
    })
    const ownerResponse = await auth.handler(signUpRequest("first-owner"))
    const sessionCookie = ownerResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ")

    const requestResponse = await auth.handler(
      new Request(
        "http://sigil-chat.localhost:1355/api/auth/request-password-reset",
        {
          body: JSON.stringify({
            email: "first-owner@example.test",
            redirectTo: "/reset-password",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://sigil-chat.localhost:1355",
          },
          method: "POST",
        },
      ),
    )
    expect(requestResponse.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()

    const unknownAccountResponse = await auth.handler(
      new Request(
        "http://sigil-chat.localhost:1355/api/auth/request-password-reset",
        {
          body: JSON.stringify({
            email: "unknown@example.test",
            redirectTo: "/reset-password",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://sigil-chat.localhost:1355",
          },
          method: "POST",
        },
      ),
    )
    expect(unknownAccountResponse.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()

    const emailRequest = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as { text: string }
    const resetUrl = emailRequest.text
      .split("\n")
      .find((line) => line.startsWith("http"))
    expect(resetUrl).toBeDefined()
    const token = new URL(resetUrl ?? "").pathname.split("/").at(-1)
    expect(token).toBeTruthy()

    const resetResponse = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/reset-password", {
        body: JSON.stringify({
          newPassword: "a-new-safe-password",
          token,
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://sigil-chat.localhost:1355",
        },
        method: "POST",
      }),
    )
    expect(resetResponse.status).toBe(200)

    const revokedSessionResponse = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/get-session", {
        headers: { cookie: sessionCookie },
      }),
    )
    expect(await revokedSessionResponse.json()).toBeNull()

    const oldPasswordResponse = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: "first-owner@example.test",
          password: "a-safe-password-value",
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://sigil-chat.localhost:1355",
        },
        method: "POST",
      }),
    )
    expect(oldPasswordResponse.status).toBe(401)

    const newPasswordResponse = await auth.handler(
      new Request("http://sigil-chat.localhost:1355/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: "first-owner@example.test",
          password: "a-new-safe-password",
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://sigil-chat.localhost:1355",
        },
        method: "POST",
      }),
    )
    expect(newPasswordResponse.status).toBe(200)
  })
})
