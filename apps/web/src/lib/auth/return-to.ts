// Same-origin `returnTo` guard.
//
// `returnTo` travels through a browser-controlled search param, so it must
// never be trusted as-is: `//evil.com`, `https://evil.com`, and
// backslash-disguised variants are all open-redirect vectors. This only ever
// returns a same-origin path (+ search + hash) or a fixed fallback — never the
// input verbatim.

export const DEFAULT_RETURN_TO = "/studio"

export function sanitizeReturnTo(
  value: unknown,
  fallback: string = DEFAULT_RETURN_TO,
): string {
  if (typeof value !== "string" || value.length === 0) return fallback
  // Reject anything that isn't a single leading slash: protocol-relative
  // (`//host`), absolute URLs, and backslash tricks some browsers normalize
  // to a scheme-relative URL are all rejected here before URL parsing.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  try {
    // Resolve against a fixed dummy origin so relative-path edge cases
    // (`/..`, encoded slashes, control characters) are canonicalized the same
    // way a browser would, then require the origin to be unchanged.
    const resolved = new URL(value, "http://sigil-chat.internal")
    if (resolved.origin !== "http://sigil-chat.internal") return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}` || fallback
  } catch {
    return fallback
  }
}
