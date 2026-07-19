// Server-side session resolution for route protection.
//
// Cookie presence alone is never proof of a session (spec: "Public routes").
// `fetchCurrentSession` always re-verifies against Better Auth server-side —
// call it from a route `beforeLoad`/loader, never trust a client-held copy
// when deciding whether to redirect.

import { createServerFn } from "@tanstack/react-start"

import { getSession } from "./session"
import { hasAnyUser } from "./server"

export interface CurrentSessionUser {
  id: string
  username: string | null
  displayUsername: string | null
  name: string
  role: "owner" | "member"
}

export const fetchCurrentSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrentSessionUser | null> => {
    const session = await getSession()
    if (!session) return null
    const { user } = session
    return {
      id: user.id,
      username: user.username ?? null,
      displayUsername: user.displayUsername ?? null,
      name: user.name,
      role: user.role,
    }
  },
)

// Backs the /setup route gate: setup is only reachable before the first
// owner exists. This is a read-only existence check, not the transaction
// that actually assigns the "owner" role (see policy.ts) — the database's
// serialized user-count read there is still what prevents a concurrent
// double-owner race; this just controls route visibility/UX.
export const fetchInstallationHasOwner = createServerFn({
  method: "GET",
}).handler(async (): Promise<boolean> => hasAnyUser())
