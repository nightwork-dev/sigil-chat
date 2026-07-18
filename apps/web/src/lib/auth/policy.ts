import type { Client } from "@libsql/client"
import { APIError } from "better-auth/api"

export type SigilRole = "member" | "owner"

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "eve",
  "gonk",
  "settings",
  "system",
])
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/

export function normalizeUsername(username: string) {
  return username.toLowerCase()
}

export function isAllowedUsername(username: string) {
  const normalized = normalizeUsername(username)
  return (
    USERNAME_PATTERN.test(normalized) && !RESERVED_USERNAMES.has(normalized)
  )
}

export interface RegistrationPolicy {
  roleForNextUser(): Promise<SigilRole>
}

export function createRegistrationPolicy(
  client: Client,
  options: { registrationOpen: boolean },
): RegistrationPolicy {
  return {
    async roleForNextUser() {
      const result = await client.execute("SELECT COUNT(*) AS count FROM user")
      const count = Number(result.rows[0]?.count ?? 0)
      if (count === 0) return "owner"
      if (options.registrationOpen) return "member"

      throw new APIError("FORBIDDEN", {
        message: "Registration is currently closed",
      })
    },
  }
}
