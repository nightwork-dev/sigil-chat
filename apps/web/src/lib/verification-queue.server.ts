// Server half of the verification queue (VQ.1): who gets the overlay.
//
// Same split and same reasoning as ./feature-flags.server.ts — this file
// touches the session and the installation-settings store, so it is only ever
// reached through a dynamic import inside a server-fn handler, never imported
// by a component.

import type { SigilAuthSession } from "./auth/server"
import { getSession } from "./auth/session"
import { isInstallationFlagEnabled } from "./feature-flags.server"
import { VERIFICATION_QUEUE_FLAG } from "./verification-queue"

/**
 * The whole gate, as a pure function of the two server-side facts.
 *
 * Returns a verdict rather than throwing: an absent overlay is the correct
 * answer for a member and for a flagged-off installation alike, and neither is
 * an error worth failing a page render over. The mutations the overlay drives
 * carry their own owner checks (`requireWorkItemsMutationAccess`); this decides
 * mounting, and nothing here is the only thing standing between a member and a
 * write.
 *
 * Both conditions are real and independently tested — delete either one and
 * verification-queue.server.test.ts goes red.
 */
export function resolveVerificationQueueAccess(
  session: SigilAuthSession | null,
  flagEnabled: boolean,
): boolean {
  if (!session || session.user.role !== "owner") return false
  return flagEnabled
}

export async function readVerificationQueueAccess(): Promise<boolean> {
  return resolveVerificationQueueAccess(
    await getSession(),
    isInstallationFlagEnabled(VERIFICATION_QUEUE_FLAG),
  )
}
