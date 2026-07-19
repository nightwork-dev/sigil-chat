import { createClient } from "@libsql/client"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertAuthMigrationsApplied,
  LATEST_AUTH_MIGRATION,
} from "./migrations"

const clients: ReturnType<typeof createClient>[] = []

afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})

describe("assertAuthMigrationsApplied", () => {
  it("fails closed until the latest committed migration is recorded", async () => {
    const client = createClient({ url: ":memory:" })
    clients.push(client)

    await expect(assertAuthMigrationsApplied(client)).rejects.toThrow(
      `not migrated through ${LATEST_AUTH_MIGRATION}`,
    )

    await client.executeMultiple(`
      CREATE TABLE sigil_auth_migration (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO sigil_auth_migration (id, applied_at)
      VALUES ('${LATEST_AUTH_MIGRATION}', '2026-07-18T00:00:00.000Z');
    `)

    await expect(assertAuthMigrationsApplied(client)).resolves.toBeUndefined()
  })
})
