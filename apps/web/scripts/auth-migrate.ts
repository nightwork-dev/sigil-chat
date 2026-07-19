import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { createAuthDatabase } from "../src/lib/auth/db"
import { readAuthEnvironment } from "../src/lib/auth/env"

const environment = readAuthEnvironment()
const { client } = createAuthDatabase(environment)
const migrationsDirectory = resolve("migrations")

try {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sigil_auth_migration (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  for (const filename of readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const applied = await client.execute({
      sql: "SELECT 1 FROM sigil_auth_migration WHERE id = ?",
      args: [filename],
    })
    if (applied.rows.length > 0) continue

    const transaction = await client.transaction("write")
    try {
      await transaction.executeMultiple(
        readFileSync(resolve(migrationsDirectory, filename), "utf8"),
      )
      await transaction.execute({
        sql: "INSERT INTO sigil_auth_migration (id, applied_at) VALUES (?, ?)",
        args: [filename, new Date().toISOString()],
      })
      await transaction.commit()
      process.stdout.write(`Applied ${filename}\n`)
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
} finally {
  client.close()
}
