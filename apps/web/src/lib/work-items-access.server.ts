import type { SigilAuthSession } from "./auth/server"
import { requireOwner } from "./auth/session"

export function requireWorkItemsMutationAccess(
  session: SigilAuthSession | null,
): SigilAuthSession {
  requireOwner(session)
  return session
}
