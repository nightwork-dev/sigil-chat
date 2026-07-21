// App-owned /eve/** proxy — replaces nitro's routeRules proxy, which 502s on
// POST /eve/v1/session in this stack (h3 2.0.1-rc + nitro 3.0.260610-beta +
// Node 24: the forwarded body stream fails undici's "non-null body source"
// check, path-specifically and before any network I/O). Root-caused with a
// patched h3 + netcat capture: the request side is fine, the h3 proxy's
// fetchOptions construction is not.
//
// This route buffers the body explicitly and forwards with plain fetch
// (proven against the live Eve). Streaming responses (SSE message streams)
// pass through untouched — the Response body is piped, never read.

import { defineHandler } from "nitro"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "expect",
  "host",
])

export default defineHandler(async (event) => {
  const { eveOrigin } = readRuntimeTopology(process.env)
  // event.path keeps the query string; strip the app origin, keep the /eve/…
  // suffix, and re-root it at the Eve service origin.
  const target = new URL(event.path, eveOrigin)

  const headers = new Headers()
  for (const [name, value] of event.req.headers.entries()) {
    if (!HOP_BY_HOP.has(name)) headers.set(name, value)
  }

  const hasBody = event.req.method !== "GET" && event.req.method !== "HEAD"
  const body = hasBody ? await event.req.arrayBuffer() : undefined

  const upstream = await fetch(target, {
    method: event.req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
  })

  const responseHeaders = new Headers()
  for (const [name, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP.has(name) && name !== "content-length" && name !== "content-encoding") {
      responseHeaders.set(name, value)
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
})
