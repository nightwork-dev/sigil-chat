import { createClient, type Client } from "@libsql/client"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AuthEnvironment } from "./env"
import { AuthInviteService, AuthInviteUnavailableError } from "./invites.server"
import { createSigilAuth } from "./server"

const TEST_PEPPER = "test-invite-pepper-that-is-at-least-32-characters"
const clients: Client[] = []
const databases: Kysely<Record<string, unknown>>[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) await database.destroy()
  for (const client of clients.splice(0)) client.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("AuthInviteService", () => {
  it("stores only a versioned keyed digest and lists the invitation", async () => {
    const { client } = await createDatabase()
    const service = createService(client, {
      ids: ["invite-1"],
      token: "raw-invite-token",
    })

    const created = await service.create("owner-1", 24)
    const stored = await client.execute(
      "SELECT token_digest FROM auth_invite WHERE id = 'invite-1'",
    )

    expect(created.token).toBe("raw-invite-token")
    expect(stored.rows[0]?.token_digest).not.toBe(created.token)
    expect(String(stored.rows[0]?.token_digest)).toMatch(/^v1:/)
    await expect(service.list()).resolves.toEqual([
      {
        createdAt: "2026-07-20T12:00:00.000Z",
        expiresAt: "2026-07-21T12:00:00.000Z",
        id: "invite-1",
        status: "available",
      },
    ])
  })

  it("redeems once, creates a member account, and supports normal sign-in", async () => {
    const { client, environment, kysely } = await createDatabase()
    const service = createService(client, {
      ids: ["invite-1", "member-1", "account-1"],
      token: "single-use-token",
    })
    await service.create("owner-1", 24)

    await expect(
      service.redeem({
        email: "Member@Example.test",
        password: "a-safe-password",
        token: "single-use-token",
      }),
    ).resolves.toEqual({ email: "member@example.test" })
    await expect(
      service.redeem({
        email: "other@example.test",
        password: "a-safe-password",
        token: "single-use-token",
      }),
    ).rejects.toBeInstanceOf(AuthInviteUnavailableError)

    const user = await client.execute(
      "SELECT role FROM user WHERE email = 'member@example.test'",
    )
    const sessions = await client.execute(
      "SELECT COUNT(*) AS count FROM session",
    )
    expect(user.rows[0]?.role).toBe("member")
    expect(Number(sessions.rows[0]?.count)).toBe(0)
    await expect(service.list()).resolves.toMatchObject([{ status: "used" }])

    const auth = createSigilAuth({ client, environment, kysely })
    const response = await auth.handler(
      new Request(`${environment.baseUrl}/api/auth/sign-in/email`, {
        body: JSON.stringify({
          email: "member@example.test",
          password: "a-safe-password",
        }),
        headers: {
          "content-type": "application/json",
          origin: environment.baseUrl,
        },
        method: "POST",
      }),
    )
    expect(response.status).toBe(200)
  })

  it("rolls back both account creation and consumption on duplicate email", async () => {
    const { client } = await createDatabase()
    const service = createService(client, {
      ids: ["invite-1"],
      token: "retry-token",
    })
    await service.create("owner-1", 24)

    await expect(
      service.redeem({
        email: "owner@example.test",
        password: "a-safe-password",
        token: "retry-token",
      }),
    ).rejects.toThrow("already exists")

    const invite = await client.execute(
      "SELECT consumed_at FROM auth_invite WHERE id = 'invite-1'",
    )
    const memberCount = await client.execute(
      "SELECT COUNT(*) AS count FROM user WHERE role = 'member'",
    )
    expect(invite.rows[0]?.consumed_at).toBeNull()
    expect(Number(memberCount.rows[0]?.count)).toBe(0)
    await expect(service.list()).resolves.toMatchObject([
      { status: "available" },
    ])
  })

  it("revokes an unused invitation", async () => {
    const { client } = await createDatabase()
    const service = createService(client, {
      ids: ["invite-1"],
      token: "revoked-token",
    })
    await service.create("owner-1", 24)

    await service.revoke("invite-1")

    await expect(
      service.redeem({
        email: "member@example.test",
        password: "a-safe-password",
        token: "revoked-token",
      }),
    ).rejects.toBeInstanceOf(AuthInviteUnavailableError)
    await expect(service.list()).resolves.toMatchObject([{ status: "revoked" }])
  })

  it("rejects an invalid token before spending password-hash work", async () => {
    const { client } = await createDatabase()
    const passwordHasher = vi.fn(() => Promise.resolve("unused"))
    const service = new AuthInviteService({
      client,
      passwordHasher,
      pepper: TEST_PEPPER,
    })

    await expect(
      service.redeem({
        email: "member@example.test",
        password: "a-safe-password",
        token: "invalid-token",
      }),
    ).rejects.toBeInstanceOf(AuthInviteUnavailableError)
    expect(passwordHasher).not.toHaveBeenCalled()
  })

  it("allows exactly one winner when the same token is redeemed concurrently", async () => {
    const { client, url } = await createDatabase()
    const otherClient = createClient({ url })
    clients.push(otherClient)
    const issuer = createService(client, {
      ids: ["invite-1"],
      token: "race-token",
    })
    await issuer.create("owner-1", 24)
    const contenderA = createService(client, {
      ids: ["member-a", "account-a"],
    })
    const contenderB = createService(otherClient, {
      ids: ["member-b", "account-b"],
    })

    const results = await Promise.allSettled([
      contenderA.redeem({
        email: "a@example.test",
        password: "a-safe-password",
        token: "race-token",
      }),
      contenderB.redeem({
        email: "b@example.test",
        password: "a-safe-password",
        token: "race-token",
      }),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    const members = await client.execute(
      "SELECT email FROM user WHERE role = 'member' ORDER BY email",
    )
    expect(members.rows).toHaveLength(1)
  })
})

interface ServiceFixture {
  ids?: string[]
  token?: string
}

function createService(client: Client, fixture: ServiceFixture = {}) {
  const ids = [...(fixture.ids ?? [])]
  return new AuthInviteService({
    client,
    createId: () => {
      const id = ids.shift()
      if (!id) throw new Error("Test ID fixture exhausted.")
      return id
    },
    ...(fixture.token ? { createToken: () => fixture.token! } : {}),
    now: () => new Date("2026-07-20T12:00:00.000Z"),
    pepper: TEST_PEPPER,
  })
}

async function createDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "sigil-auth-invites-"))
  temporaryDirectories.push(directory)
  const url = `file:${join(directory, "auth.db")}`
  const client = createClient({ url })
  const kysely = new Kysely<Record<string, unknown>>({
    dialect: new LibsqlDialect({ url }),
  })
  clients.push(client)
  databases.push(kysely)
  await client.executeMultiple(
    ["0001_better_auth.sql", "0003_auth_invites.sql"]
      .map((filename) => readFileSync(resolve("migrations", filename), "utf8"))
      .join("\n"),
  )
  await client.execute({
    sql: `
      INSERT INTO user (
        id, name, email, emailVerified, createdAt, updatedAt,
        username, displayUsername, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      "owner-1",
      "Owner",
      "owner@example.test",
      1,
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "owner",
      "owner",
      "owner",
    ],
  })

  const environment: AuthEnvironment = {
    baseUrl: "http://sigil-chat.localhost:1355",
    databaseUrl: url,
    installationId: "test-installation",
    isProduction: false,
    registrationOpen: false,
    secret: "test-secret-with-at-least-thirty-two-characters",
    socialProviders: {},
    trustedOrigins: ["http://sigil-chat.localhost:1355"],
  }
  return { client, environment, kysely, url }
}
