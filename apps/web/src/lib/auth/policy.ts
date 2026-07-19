import type { Client } from "@libsql/client"
import { APIError } from "better-auth/api"

import { isAllowedUsername, normalizeUsername } from "./username-rules"

export type SigilRole = "member" | "owner"

// The charset/reserved rules are pure + client-safe (see username-rules.ts).
// Re-exported here so existing server consumers keep importing from ./policy.
export { isAllowedUsername, normalizeUsername }

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
