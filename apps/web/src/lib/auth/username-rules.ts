// Pure, client-safe username rules — the charset/reserved policy with NO
// server dependencies, so both the server (policy.ts, server.ts) and the
// client setup form (username-from-email.ts) can share one definition without
// dragging @libsql/better-auth into the browser bundle.

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "eve",
  "gonk",
  "settings",
  "system",
])

// 1–32 chars: starts/ends [a-z0-9], middle may include . _ -. Length is not a
// security property on a self-hosted install, so a single character is fine.
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

export function normalizeUsername(username: string) {
  return username.toLowerCase()
}

export function isAllowedUsername(username: string) {
  const normalized = normalizeUsername(username)
  return (
    USERNAME_PATTERN.test(normalized) && !RESERVED_USERNAMES.has(normalized)
  )
}
