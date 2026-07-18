import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getMigrations } from "better-auth/db/migration"

import { createAuthDatabase, type AuthDatabase } from "../src/lib/auth/db"
import { readAuthEnvironment } from "../src/lib/auth/env"
import { createSigilAuthOptions } from "../src/lib/auth/server"

const temporaryDirectory = mkdtempSync(join(tmpdir(), "sigil-auth-generate-"))
let database: AuthDatabase | undefined

try {
  const environment = readAuthEnvironment({
    ...process.env,
    NODE_ENV: "development",
    SIGIL_DATABASE_URL: `file:${join(temporaryDirectory, "auth.db")}`,
  })
  database = createAuthDatabase(environment)
  const migrations = await getMigrations(
    createSigilAuthOptions({ ...database, environment }),
  )
  const sql = await migrations.compileMigrations()

  process.stdout.write(`${sql.trim()}\n`)
} finally {
  await database?.kysely.destroy()
  database?.client.close()
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
