import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Buffer } from "node:buffer"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createSigilMcpHandler } from "./mcp-handler.js"
import { handleArtifactRoute } from "./artifact-routes.js"
import { handleArtifactImageRoute } from "./artifact-image-route.js"
import { readGonkServerEnvironment } from "@workspace/runtime-env/server"
import {
  createHealthResponse,
  createLivenessResponse,
  isHealthRequestAuthorized,
} from "./health.js"
import { artifactPublicUrl, getSessionArtifactStore } from "./artifact-store.js"
import {
  formatScopeHeader,
  normalizeScopeHeaders,
  type ResourceScope,
  SIGIL_SCOPE_HEADER,
  SIGIL_SESSION_SCOPE_HEADER,
} from "./artifact-scope.js"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"

// Direct app-local development may still load root .env overrides. The normal
// root `pnpm dev` launcher supplies one generated service key to web, Eve, and
// Gonk before any process starts, so it does not depend on an app-local symlink.
if (process.env.GONK_MCP_KEY === undefined) {
  const rootEnv = resolve(import.meta.dirname, "../../../.env")
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
}

const { port, apiKey } = readGonkServerEnvironment(process.env)
const maxRequestBodyBytes = 1024 * 1024
const host = process.env.HOST ?? "127.0.0.1"
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

// apiKey is narrowed to a string here by the guard above (the process exits
// otherwise); capture it so nested request handlers keep that non-undefined type.
const serviceBearerKey: string = apiKey
const handler = createSigilMcpHandler({ apiKey, port })
const mcpSessionScopes = new Map<
  string,
  { bearer: string; scope: ResourceScope; scopeProof: string }
>()

const server = createServer((request, response) => {
  void handleRequest(request, response)
})

server.listen(port, host, () => {
  const address = server.address() as AddressInfo
  console.log(`Gonk MCP listening on http://${host}:${address.port}/mcp`)
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
    if (pathname === "/live") {
      await writeWebResponse(outgoing, createLivenessResponse())
      return
    }
    if (pathname === "/health") {
      if (
        !isHealthRequestAuthorized(
          incoming.headers.authorization,
          serviceBearerKey,
        )
      ) {
        outgoing.writeHead(401, {
          "content-type": "text/plain; charset=utf-8",
        })
        outgoing.end("Unauthorized")
        return
      }
      const health = await createHealthResponse()
      outgoing.writeHead(health.status, Object.fromEntries(health.headers))
      outgoing.end(await health.text())
      return
    }
    if (pathname.startsWith("/img/")) {
      await serveImage(
        pathname.slice("/img/".length),
        incoming.headers.authorization,
        incoming.headers[SIGIL_SCOPE_HEADER] as string | undefined,
        outgoing,
      )
      return
    }
    // Uploads use the same service bearer as reads and MCP.
    if (pathname === "/upload") {
      await handleUpload(incoming, outgoing)
      return
    }
    // Authenticated artifact-resource API (list/delete). Consumed only by the
    // web app's server functions with the service bearer — never the browser.
    if (pathname === "/artifacts" || pathname.startsWith("/artifacts/")) {
      await handleArtifacts(incoming, outgoing, pathname)
      return
    }
    if (pathname !== "/mcp") {
      outgoing.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      outgoing.end("Not found")
      return
    }
    let request = await toWebRequest(incoming)
    const sessionId = request.headers.get("mcp-session-id")
    const bearer = request.headers.get("authorization") ?? ""
    const requestedScope = normalizeScopeHeaders(
      request.headers.get(SIGIL_SCOPE_HEADER) ?? undefined,
      request.headers.get(SIGIL_SESSION_SCOPE_HEADER) ?? undefined,
    )
    const requestedScopeProof =
      request.headers.get(AGENT_SCOPE_PROOF_HEADER) ?? undefined
    const remembered = sessionId ? mcpSessionScopes.get(sessionId) : undefined
    const scope =
      requestedScope ??
      (remembered?.bearer === bearer ? remembered.scope : undefined)
    const scopeProof =
      requestedScopeProof ??
      (remembered?.bearer === bearer ? remembered.scopeProof : undefined)
    if (scope && !request.headers.has(SIGIL_SCOPE_HEADER)) {
      const headers = new Headers(request.headers)
      headers.set(SIGIL_SCOPE_HEADER, formatScopeHeader(scope)!)
      if (scopeProof) headers.set(AGENT_SCOPE_PROOF_HEADER, scopeProof)
      request = new Request(request, { headers })
    } else if (scopeProof && !request.headers.has(AGENT_SCOPE_PROOF_HEADER)) {
      const headers = new Headers(request.headers)
      headers.set(AGENT_SCOPE_PROOF_HEADER, scopeProof)
      request = new Request(request, { headers })
    }
    const response = await handler.handle(request)
    const establishedSessionId = response.headers.get("mcp-session-id")
    if (establishedSessionId && requestedScope && requestedScopeProof) {
      mcpSessionScopes.set(establishedSessionId, {
        bearer,
        scope: requestedScope,
        scopeProof: requestedScopeProof,
      })
    }
    await writeWebResponse(outgoing, response)
  } catch (error) {
    console.error(error)
    if (!outgoing.headersSent) {
      outgoing.writeHead(
        error instanceof RequestBodyTooLargeError ? 413 : 500,
        {
          "content-type": "text/plain; charset=utf-8",
        },
      )
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
  authorization: string | undefined,
  scopeHeader: string | undefined,
  outgoing: ServerResponse,
): Promise<void> {
  const key = decodeURIComponent(rawKey)
  const result = await handleArtifactImageRoute({
    apiKey: serviceBearerKey,
    authorization,
    id: key,
    scopeHeader,
    store: getSessionArtifactStore(),
  })
  if (result.status !== 200) {
    outgoing.writeHead(result.status, {
      "content-type": "text/plain; charset=utf-8",
    })
    outgoing.end(result.status === 401 ? "Unauthorized" : "Not found")
    return
  }
  outgoing.writeHead(200, {
    "content-type": result.mediaType,
    "content-length": String(result.bytes.byteLength),
    // Content-addressed key → the bytes never change → cache forever.
    "cache-control": "public, max-age=31536000, immutable",
    // No CORS header: only the authenticated web server proxies these bytes.
  })
  outgoing.end(Buffer.from(result.bytes))
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

  const resourceScope = normalizeScopeHeaders(
    readHeader(incoming.headers[SIGIL_SCOPE_HEADER]),
    readHeader(incoming.headers[SIGIL_SESSION_SCOPE_HEADER]),
  )
  if (!resourceScope) {
    outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end(`Missing ${SIGIL_SCOPE_HEADER} header`)
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
    outgoing.writeHead(error instanceof RequestBodyTooLargeError ? 413 : 400, {
      "content-type": "text/plain; charset=utf-8",
    })
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
      scope: resourceScope,
    })
  } catch (error) {
    console.error(error)
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    outgoing.end("Failed to store upload")
    return
  }

  const body = JSON.stringify({
    url: artifactPublicUrl(artifact.id, artifact.scope),
    key: artifact.id,
    mediaType: artifact.mediaType,
    size: artifact.size,
    filename: artifact.filename,
  })
  outgoing.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
  })
  outgoing.end(body)
}

async function handleArtifacts(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  pathname: string,
): Promise<void> {
  const id = pathname.startsWith("/artifacts/")
    ? decodeURIComponent(pathname.slice("/artifacts/".length))
    : undefined
  const result = await handleArtifactRoute(
    {
      method: incoming.method ?? "GET",
      authorization: incoming.headers.authorization,
      scopeHeader: readHeader(incoming.headers[SIGIL_SCOPE_HEADER]),
      legacyScopeHeader: readHeader(
        incoming.headers[SIGIL_SESSION_SCOPE_HEADER],
      ),
      id,
    },
    { apiKey: serviceBearerKey, store: getSessionArtifactStore() },
  )
  if (result.json !== undefined) {
    outgoing.writeHead(result.status, {
      "content-type": "application/json; charset=utf-8",
    })
    outgoing.end(JSON.stringify(result.json))
    return
  }
  outgoing.writeHead(result.status, {
    "content-type": "text/plain; charset=utf-8",
  })
  outgoing.end(result.text ?? "")
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
