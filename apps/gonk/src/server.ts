import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Buffer } from "node:buffer"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createSigilMcpHandler } from "./mcp-handler.js"
import { readGonkServerEnvironment } from "@workspace/runtime-env/server"
import { createHealthResponse } from "./health.js"
import {
  artifactPublicUrl,
  getArtifactStore,
  getSessionArtifactStore,
} from "./artifact-store.js"
import {
  normalizeSessionScope,
  SIGIL_SESSION_SCOPE_HEADER,
} from "./artifact-scope.js"

// Local dev: load the repo-root .env (the single source of truth this process
// shares with the Eve host — apps/agent/.env is a symlink to the same file, and
// `eve dev` loads it natively). This is what makes the GONK_MCP_KEY the two
// processes MUST agree on survive a restart without being exported in the
// launching shell. A value already present in the parent environment wins,
// matching Eve's dev env-file precedence — so an explicit export still overrides.
if (process.env.GONK_MCP_KEY === undefined) {
  const rootEnv = resolve(import.meta.dirname, "../../../.env")
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
}

const { port, apiKey } = readGonkServerEnvironment(process.env)
const maxRequestBodyBytes = 1024 * 1024
// Uploads are real file bytes (photos, PDFs), not JSON tool payloads — give
// them a bigger ceiling than the MCP JSON body limit above.
const maxUploadBodyBytes = 10 * 1024 * 1024

if (!apiKey) {
  console.error(
    [
      "Gonk MCP refuses to start without authentication.",
      "Set GONK_MCP_KEY to a bearer token.",
      "Why: the Portless proxy exposes this endpoint machine-wide; loopback binding is not sufficient isolation.",
    ].join("\n"),
  )
  process.exit(1)
}

const handler = createSigilMcpHandler({ apiKey, port })

const server = createServer((request, response) => {
  void handleRequest(request, response)
})

server.listen(port, "127.0.0.1", () => {
  const address = server.address() as AddressInfo
  console.log(`Gonk MCP listening on http://127.0.0.1:${address.port}/mcp`)
})

async function stop(): Promise<void> {
  await handler.close()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  process.exit(0)
}

process.once("SIGINT", () => void stop())
process.once("SIGTERM", () => void stop())

async function handleRequest(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  try {
    const pathname = new URL(
      incoming.url ?? "/",
      `http://${incoming.headers.host ?? `127.0.0.1:${port}`}`,
    ).pathname
    if (pathname === "/health") {
      const health = createHealthResponse()
      outgoing.writeHead(health.status, Object.fromEntries(health.headers))
      outgoing.end(await health.text())
      return
    }
    // Serve generated/attached image bytes. Deliberately UNauthenticated (before
    // the /mcp bearer gate): a browser <img src> can't send the MCP key, and the
    // key is a content hash (unguessable, immutable), not a capability.
    if (pathname.startsWith("/img/")) {
      await serveImage(pathname.slice("/img/".length), outgoing)
      return
    }
    // Unlike /img (unauthenticated read of content-addressed, unguessable
    // bytes), /upload is a WRITE path: an unauthenticated version would let
    // anything reachable via the Portless proxy use this process as an open
    // file drop. Require the same bearer key that gates /mcp.
    if (pathname === "/upload") {
      await handleUpload(incoming, outgoing)
      return
    }
    if (pathname !== "/mcp") {
      outgoing.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      outgoing.end("Not found")
      return
    }
    const request = await toWebRequest(incoming)
    const response = await handler.handle(request)
    await writeWebResponse(outgoing, response)
  } catch (error) {
    console.error(error)
    if (!outgoing.headersSent) {
      outgoing.writeHead(error instanceof RequestBodyTooLargeError ? 413 : 500, {
        "content-type": "text/plain; charset=utf-8",
      })
    }
    outgoing.end(
      error instanceof RequestBodyTooLargeError
        ? "Request body too large"
        : "Internal server error",
    )
  }
}

async function serveImage(
  rawKey: string,
  outgoing: ServerResponse,
): Promise<void> {
  const store = getArtifactStore()
  const key = decodeURIComponent(rawKey)
  let info
  let stream
  try {
    // head() first: gives mediaType/size and validates the key (assertObjectKey
    // throws on traversal attempts like `..`, which we treat as not-found).
    info = await store.head(key)
    stream = info ? await store.get(key) : undefined
  } catch {
    info = undefined
    stream = undefined
  }
  if (!info || !stream) {
    outgoing.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Not found")
    return
  }
  outgoing.writeHead(200, {
    "content-type": info.mediaType ?? "application/octet-stream",
    "content-length": String(info.sizeBytes),
    // Content-addressed key → the bytes never change → cache forever.
    "cache-control": "public, max-age=31536000, immutable",
    // Public, unguessable, read-only image bytes. The chat client fetches these
    // cross-origin (sigil-chat.localhost → sigil-chat-gonk.localhost) to inline
    // an attachment into a turn, and fetch()/arrayBuffer() is CORS-gated even
    // though <img> display is not. `*` is safe on already-public image bytes.
    "access-control-allow-origin": "*",
  })
  for await (const chunk of stream) {
    outgoing.write(Buffer.from(chunk))
  }
  outgoing.end()
}

async function toWebRequest(incoming: IncomingMessage): Promise<Request> {
  const host = incoming.headers.host ?? `127.0.0.1:${port}`
  const url = new URL(incoming.url ?? "/mcp", `http://${host}`)
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  const method = incoming.method ?? "GET"
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.concat(await readIncomingBody(incoming))

  return new Request(url, { method, headers, body })
}

async function readIncomingBody(
  incoming: IncomingMessage,
  maxBytes: number = maxRequestBodyBytes,
): Promise<readonly Buffer[]> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of incoming) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBytes) throw new RequestBodyTooLargeError()
    chunks.push(buffer)
  }
  return chunks
}

class RequestBodyTooLargeError extends Error {}

async function handleUpload(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  if (incoming.headers.authorization !== `Bearer ${apiKey}`) {
    outgoing.writeHead(401, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Unauthorized")
    return
  }
  if (incoming.method !== "POST") {
    outgoing.writeHead(405, {
      "content-type": "text/plain; charset=utf-8",
      allow: "POST",
    })
    outgoing.end("Method not allowed")
    return
  }

  const sessionScope = normalizeSessionScope(
    readHeader(incoming.headers[SIGIL_SESSION_SCOPE_HEADER]),
  )
  if (!sessionScope) {
    outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end(`Missing ${SIGIL_SESSION_SCOPE_HEADER} header`)
    return
  }

  const mediaType = incoming.headers["content-type"]
  if (typeof mediaType !== "string" || mediaType.length === 0) {
    outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Missing Content-Type header")
    return
  }
  const filenameHeader = incoming.headers["x-filename"]
  const filename = Array.isArray(filenameHeader)
    ? filenameHeader[0]
    : filenameHeader

  let bytes: Buffer
  try {
    bytes = Buffer.concat(await readIncomingBody(incoming, maxUploadBodyBytes))
  } catch (error) {
    outgoing.writeHead(
      error instanceof RequestBodyTooLargeError ? 413 : 400,
      { "content-type": "text/plain; charset=utf-8" },
    )
    outgoing.end(
      error instanceof RequestBodyTooLargeError
        ? "Upload body too large"
        : "Bad request",
    )
    return
  }
  if (bytes.byteLength === 0) {
    outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Empty upload body")
    return
  }

  let artifact
  try {
    artifact = await getSessionArtifactStore().putFile({
      bytes,
      filename,
      mediaType,
      scope: sessionScope,
    })
  } catch (error) {
    console.error(error)
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Failed to store upload")
    return
  }

  const body = JSON.stringify({
    url: artifactPublicUrl(artifact.id),
    key: artifact.id,
    mediaType: artifact.mediaType,
    size: artifact.size,
    filename: artifact.filename,
  })
  outgoing.writeHead(200, { "content-type": "application/json; charset=utf-8" })
  outgoing.end(body)
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function writeWebResponse(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status
  response.headers.forEach((value, name) => {
    outgoing.setHeader(name, value)
  })
  if (!response.body) {
    outgoing.end()
    return
  }
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      outgoing.write(Buffer.from(value))
    }
    outgoing.end()
  } finally {
    reader.releaseLock()
  }
}
