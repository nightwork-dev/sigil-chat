import type { Client } from "@libsql/client";

export async function checkWebHealth(client: Client): Promise<void> {
  await client.execute(
    "CREATE TEMP TABLE IF NOT EXISTS sigil_health_probe (id INTEGER PRIMARY KEY, checked_at TEXT NOT NULL)",
  );
  await client.execute({
    sql: "INSERT OR REPLACE INTO sigil_health_probe (id, checked_at) VALUES (1, ?)",
    args: [new Date().toISOString()],
  });
  const result = await client.execute(
    "SELECT checked_at FROM sigil_health_probe WHERE id = 1",
  );
  if (result.rows.length !== 1) throw new Error("database health probe failed");
}
