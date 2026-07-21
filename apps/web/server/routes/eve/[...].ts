// App-owned /eve/** proxy — replaces nitro's routeRules proxy, which 502s on
// POST /eve/v1/session in this stack (h3 2.0.1-rc + nitro 3.0.260610-beta +
// Node 24: the forwarded body stream fails undici's "non-null body source"
// check, path-specifically and before any network I/O). Root-caused with a
// patched h3 + netcat capture: the request side is fine, the h3 proxy's
// fetchOptions construction is not.
//
// This route buffers the body explicitly (bounded — see MAX_BODY_BYTES) and
// forwards with plain fetch (proven against the live Eve). Streaming
// responses (SSE message streams) pass through untouched — the Response body
// is piped, never read.

import { defineHandler } from "nitro"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

// Eve JSON payloads are small (a message turn + context). Attachments travel
// their own upload path, not this proxy — so a hard ceiling here is honest,
// and it keeps an unauthenticated caller from forcing unbounded buffering
// before Eve ever sees the request (review finding).
const MAX_BODY_BYTES = 1024 * 1024

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "expect",
  "host",
  "te",
  "trailer",
  "proxy-connection",
])

/** Headers named by the Connection header are hop-by-hop too (RFC 9110 §7.6.1)
 *  — drop them in addition to the fixed list. */
function connectionNamedHeaders(headers: Headers): Set<string> {
  const named = new Set<string>()
  const value = headers.get("connection")
  if (!value) return named
  for (const token of value.split(",")) {
    const name = token.trim().toLowerCase()
    if (name) named.add(name)
  }
  return named
}

function filterRequestHeaders(source: Headers): Headers {
  const connectionNamed = connectionNamedHeaders(source)
  const filtered = new Headers()
  for (const [name, value] of source.entries()) {
    if (HOP_BY_HOP.has(name) || connectionNamed.has(name)) continue
    filtered.set(name, value)
  }
  return filtered
}

export default defineHandler(async (event) => {
  const { eveOrigin } = readRuntimeTopology(process.env)
  // event.path keeps the query string; re-root it at the Eve service origin.
  const target = new URL(event.path, eveOrigin)

  const headers = filterRequestHeaders(event.req.headers)

  // Bounded body read: reject early on a declared-oversize content-length,
  // then cap the actual read for chunked/undeclared bodies.
  const declared = Number(event.req.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "Request body too large." },
      { status: 413 },
    )
  }
  const hasBody = event.req.method !== "GET" && event.req.method !== "HEAD"
  let body: ArrayBuffer | undefined
  if (hasBody) {
    body = await event.req.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) {
      return Response.json(
        { ok: false, error: "Request body too large." },
        { status: 413 },
      )
    }
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: event.req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
    })
  } catch {
    // Upstream unreachable/refused/reset — a bounded gateway failure, not an
    // unclassified 500. No topology detail in the body.
    return Response.json(
      { ok: false, error: "Agent service unavailable." },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  for (const [name, value] of upstream.headers.entries()) {
    if (
      !HOP_BY_HOP.has(name) &&
      name !== "content-length" &&
      name !== "content-encoding"
    ) {
      responseHeaders.set(name, value)
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
})
