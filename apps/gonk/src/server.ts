import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { Buffer } from "node:buffer"
import { createSigilMcpHandler } from "./mcp-handler.js"

const port = Number.parseInt(process.env.PORT ?? "8808", 10)
const apiKey = process.env.GONK_MCP_KEY
const maxRequestBodyBytes = 1024 * 1024

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
): Promise<readonly Buffer[]> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of incoming) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxRequestBodyBytes) throw new RequestBodyTooLargeError()
    chunks.push(buffer)
  }
  return chunks
}

class RequestBodyTooLargeError extends Error {}

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
