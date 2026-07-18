import { createClient, type Client } from "@libsql/client"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  createRegistrationPolicy,
  isAllowedUsername,
  normalizeUsername,
} from "./policy"

const clients: Client[] = []
const temporaryDirectories: string[] = []

async function createMigratedClient() {
  const directory = mkdtempSync(join(tmpdir(), "sigil-auth-policy-"))
  temporaryDirectories.push(directory)
  const client = createClient({ url: `file:${join(directory, "auth.db")}` })
  clients.push(client)
  await client.executeMultiple(
    readFileSync(resolve("migrations/0001_better_auth.sql"), "utf8"),
  )
  return client
}

afterEach(() => {
  for (const client of clients.splice(0)) client.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("username policy", () => {
  it("normalizes case and rejects reserved or malformed names", () => {
    expect(normalizeUsername("David.Tools")).toBe("david.tools")
    expect(isAllowedUsername("david-tools")).toBe(true)
    expect(isAllowedUsername("admin")).toBe(false)
    expect(isAllowedUsername("-david")).toBe(false)
    expect(isAllowedUsername("da")).toBe(false)
  })
})

describe("registration policy", () => {
  it("assigns owner only to a fresh installation and then closes registration", async () => {
    const client = await createMigratedClient()
    const policy = createRegistrationPolicy(client, {
      registrationOpen: false,
    })

    expect(await policy.roleForNextUser()).toBe("owner")
    await client.execute({
      sql: `INSERT INTO user
        (id, name, email, emailVerified, createdAt, updatedAt, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "owner-1",
        "Owner",
        "owner@example.test",
        0,
        new Date(),
        new Date(),
        "owner",
      ],
    })

    await expect(policy.roleForNextUser()).rejects.toMatchObject({
      status: "FORBIDDEN",
    })
  })

  it("admits later members only when registration is explicitly open", async () => {
    const client = await createMigratedClient()
    await client.execute({
      sql: `INSERT INTO user
        (id, name, email, emailVerified, createdAt, updatedAt, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "owner-1",
        "Owner",
        "owner@example.test",
        0,
        new Date(),
        new Date(),
        "owner",
      ],
    })

    const policy = createRegistrationPolicy(client, { registrationOpen: true })
    expect(await policy.roleForNextUser()).toBe("member")
  })

  it("enforces the single-owner invariant under concurrent writes", async () => {
    const client = await createMigratedClient()
    const insertOwner = (id: string) =>
      client.execute({
        sql: `INSERT INTO user
        (id, name, email, emailVerified, createdAt, updatedAt, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          "Owner",
          `${id}@example.test`,
          0,
          new Date(),
          new Date(),
          "owner",
        ],
      })

    const results = await Promise.allSettled([
      insertOwner("owner-1"),
      insertOwner("owner-2"),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
  })
})
