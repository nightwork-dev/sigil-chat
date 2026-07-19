// Derive a default username + display name from an email address.
//
// Setup and registration collect EMAIL + PASSWORD only;
// the username is the @mention handle, auto-derived here and editable later in
// Settings → Account. Pure + client-safe (no server imports) so the setup form
// and any server-side defaulting can share one derivation.

import { isAllowedUsername } from "./username-rules"

const FALLBACK_USERNAME = "user"

/**
 * A username that always PASSES the server validator (isAllowedUsername):
 * lowercase, `[a-z0-9._-]`, starts/ends `[a-z0-9]`, 1–32 chars, non-reserved.
 * When the sanitized local-part is empty or reserved (e.g. `admin@…`), append
 * a digit until it validates — the setup form no longer shows a username field,
 * so a client-side reject would be unfixable. Uniqueness across existing users
 * is NOT guaranteed here (a server concern; moot for the first-owner setup).
 */
export function usernameFromEmail(email: string): string {
  const localPart = (email.split("@")[0] ?? "").toLowerCase()
  const cleaned = localPart.replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+/, "")
  const base = cleaned.slice(0, 32).replace(/[._-]+$/, "") || FALLBACK_USERNAME
  if (isAllowedUsername(base)) return base
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const candidate = `${base.slice(0, 30)}${suffix}`
    if (isAllowedUsername(candidate)) return candidate
  }
  return FALLBACK_USERNAME
}

/** The email local-part as an editable starting display name. */
export function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? ""
  return localPart.length > 0 ? localPart : email
}
