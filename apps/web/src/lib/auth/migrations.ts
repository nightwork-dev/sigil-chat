import type { Client } from "@libsql/client"

export const LATEST_AUTH_MIGRATION = "0001_better_auth.sql"

export async function assertAuthMigrationsApplied(client: Client) {
  try {
    const result = await client.execute({
      sql: "SELECT 1 FROM sigil_auth_migration WHERE id = ?",
      args: [LATEST_AUTH_MIGRATION],
    })
    if (result.rows.length === 0) throw new Error("migration not recorded")
  } catch (cause) {
    throw new Error(
      `Auth database is not migrated through ${LATEST_AUTH_MIGRATION}; run pnpm auth:migrate`,
      { cause },
    )
  }
}
