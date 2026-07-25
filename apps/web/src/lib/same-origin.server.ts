// Same-origin guard for state-changing routes that accept CORS-simple bodies.
//
// A multipart/form-data POST is a "simple" request: the browser sends it
// cross-origin WITHOUT a preflight, cookies attached. The response stays
// unreadable cross-origin, so this is not a disclosure hole — but a hostile
// page could still spend the user's session against an expensive backend
// (e.g. transcription). Browsers attach an Origin header to every
// cross-origin POST, so refusing a mismatched Origin closes that off;
// requests with no Origin (same-origin navigations, curl, server-to-server)
// are untouched.

export function rejectCrossOrigin(request: Request): Response | undefined {
  const origin = request.headers.get("Origin")
  if (!origin) return undefined
  // An opaque origin (sandboxed iframe, data: URL) is never our own page.
  if (origin === "null") return new Response(null, { status: 403 })
  // Compare hosts rather than full origins: behind a TLS-terminating proxy
  // request.url is http:// while the browser's Origin is https://, and a
  // scheme mismatch alone should not lock the app's own pages out.
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return new Response(null, { status: 403 })
  }
  const requestHost = new URL(request.url).host
  if (originHost !== requestHost) return new Response(null, { status: 403 })
  return undefined
}
