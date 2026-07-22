import { createClient, type Client } from "@libsql/client"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { hashPassword } from "better-auth/crypto"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthEnvironment } from "./auth/env"
import { createSigilAuth, type SigilAuthSession } from "./auth/server"
import {
  ExternalMcpCredentialService,
  type ExternalMcpKeyCreateInput,
  handleExternalMcpRequest,
  resetExternalMcpGatewayStateForTests,
} from "./external-mcp.server"

const clients: Client[] = []
const databases: Kysely<Record<string, unknown>>[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  resetExternalMcpGatewayStateForTests()
  for (const database of databases.splice(0)) await database.destroy()
  for (const client of clients.splice(0)) client.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("ExternalMcpCredentialService", () => {
  it("creates one-time hashed keys and never turns API keys into sessions", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Codex desktop",
      resourceScope: "project:roadmap",
    })

    expect(created.key).toMatch(/^sigil_live_/)
    expect(created.summary.safeStart).toMatch(/^sigil_live_/)
    expect(created.summary.safeSuffix).toBe(created.key.slice(-4))
    expect(created.summary.toolAllowlist).toEqual([
      "sigil-spec-list",
      "sigil-spec-inspect",
      "sigil-story-list",
      "sigil-story-inspect",
    ])

    const stored = await fixture.client.execute(
      "SELECT key FROM apikey WHERE id = ?",
      [created.summary.id],
    )
    expect(stored.rows[0]?.key).not.toBe(created.key)
    expect(String(stored.rows[0]?.key).length).toBeGreaterThan(32)

    await expect(fixture.service.list(fixture.session)).resolves.toEqual([
      expect.objectContaining({
        id: created.summary.id,
        safeSuffix: created.key.slice(-4),
      }),
    ])
    const sessionFromApiKey = await fixture.auth.api.getSession({
      headers: new Headers({ "x-api-key": created.key }),
    })
    expect(sessionFromApiKey).toBeNull()
  })

  it("requires an explicit password step-up receipt for key lifecycle actions", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Receipted",
      resourceScope: "project:roadmap",
    })
    await fixture.client.execute({
      sql: "UPDATE session SET updatedAt = ? WHERE id = ?",
      args: ["2026-07-20T12:00:00.000Z", fixture.session.session.id],
    })

    await expect(
      fixture.service.create(fixture.session, {
        name: "No receipt",
        resourceScope: "project:roadmap",
      }),
    ).rejects.toThrow("Step-up reauthentication")
    await expect(
      fixture.service.replace(fixture.session, created.summary.id),
    ).rejects.toThrow("Step-up reauthentication")
    await expect(
      fixture.service.revoke(fixture.session, created.summary.id),
    ).rejects.toThrow("Step-up reauthentication")
    await expect(
      fixture.service.issueStepUpReceipt(fixture.session, "wrong-password"),
    ).rejects.toThrow("Step-up reauthentication")

    const receipt = await fixture.stepUp()
    await fixture.service.revoke(
      fixture.session,
      created.summary.id,
      receipt,
    )
    await expect(
      fixture.service.create(
        fixture.session,
        { name: "Reused receipt", resourceScope: "project:roadmap" },
        receipt,
      ),
    ).rejects.toThrow("Step-up reauthentication")
  })

  it("caps active external MCP keys at 20 per user", async () => {
    const fixture = await createFixture()
    for (let index = 0; index < 20; index += 1) {
      await fixture.createKey({
        name: `Key ${index}`,
        resourceScope: "project:roadmap",
      })
    }

    await expect(
      fixture.createKey({
        name: "One too many",
        resourceScope: "project:roadmap",
      }),
    ).rejects.toThrow("active key limit")
  })
})

describe("handleExternalMcpRequest", () => {
  it("filters discovery and forwards only the internal service bearer", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Observer",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkMcpUrl: "http://gonk.internal/mcp",
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(200)
    expect(upstreamRequests).toHaveLength(1)
    expect(upstreamRequests[0]?.headers.get("authorization")).toBe(
      "Bearer internal-service-bearer",
    )
    expect(upstreamRequests[0]?.headers.get("authorization")).not.toContain(
      created.key,
    )
    expect(upstreamRequests[0]?.headers.get("x-sigil-scope")).toBe(
      "project:roadmap",
    )
    expect(upstreamRequests[0]?.headers.has("x-sigil-scope-proof")).toBe(true)

    const payload = await response.json()
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "sigil-spec-list",
      "sigil-story-inspect",
    ])
  })

  it("denies ungranted write tools before Gonk sees the request", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Read only",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sigil-spec-create", arguments: {} },
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(403)
    expect(upstreamRequests).toHaveLength(0)
  })

  it("filters streamed SSE discovery responses too", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Observer stream",
      resourceScope: "project:roadmap",
    })
    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonkSse(),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    const text = await response.text()
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(text).toContain("sigil-spec-list")
    expect(text).not.toContain("sigil-spec-create")
    expect(text).not.toContain("sigil-image-generate")
  })

  it("allows explicit collaborator writes", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Collaborator",
      operation: "write",
      profile: "collaborator",
      resourceScope: "project:roadmap",
      toolAllowlist: ["sigil-spec-list", "sigil-spec-create"],
    })
    const upstreamRequests: Request[] = []
    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sigil-spec-create", arguments: { id: "spec-1" } },
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(200)
    expect(upstreamRequests).toHaveLength(1)
  })

  it("denies requests when live resource membership has been removed", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Membership checked",
      resourceScope: "project:roadmap",
    })
    fixture.resourceAccess.allowed = false
    const upstreamRequests: Request[] = []

    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(403)
    expect(upstreamRequests).toHaveLength(0)
  })

  it("denies requested scopes outside the credential grant before proxying", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Cross resource",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []

    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { resourceScope: "project:other" },
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(403)
    expect(upstreamRequests).toHaveLength(0)
  })

  it("rejects cookies and credential-like JSON-RPC metadata before proxying", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Smuggling",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    const cookieResponse = await handleExternalMcpRequest(
      mcpRequest(
        created.key,
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { cookie: "sid=browser-session" },
      ),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )
    const metadataResponse = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: { _meta: { authorization: "Bearer stolen" } },
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(cookieResponse.status).toBe(401)
    expect(metadataResponse.status).toBe(401)
    expect(upstreamRequests).toHaveLength(0)
  })

  it("denies missing principals before minting a delegation", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Principal deleted",
      resourceScope: "project:roadmap",
    })
    await fixture.client.execute("PRAGMA foreign_keys = OFF")
    await fixture.client.execute({
      sql: "UPDATE apikey SET referenceId = ? WHERE id = ?",
      args: ["missing-user", created.summary.id],
    })
    await fixture.client.execute({
      sql: "UPDATE external_mcp_grant SET principal_id = ? WHERE credential_id = ?",
      args: ["missing-user", created.summary.id],
    })
    await fixture.client.execute("PRAGMA foreign_keys = ON")
    const upstreamRequests: Request[] = []

    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(401)
    expect(upstreamRequests).toHaveLength(0)
  })

  it("rejects a revoked key on the next request in an initialized session", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Short lived",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    const init = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests, { sessionId: "session-a" }),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )
    expect(init.headers.get("mcp-session-id")).toBe("session-a")

    await fixture.service.revoke(
      fixture.session,
      created.summary.id,
      await fixture.stepUp(),
    )
    const afterRevoke = await handleExternalMcpRequest(
      mcpRequest(
        created.key,
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { sessionId: "session-a" },
      ),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(afterRevoke.status).toBe(401)
    expect(upstreamRequests).toHaveLength(1)
  })

  it("prevents an MCP session from changing credential identity", async () => {
    const fixture = await createFixture()
    const first = await fixture.createKey({
      name: "First",
      resourceScope: "project:roadmap",
    })
    const second = await fixture.createKey({
      name: "Second",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    await handleExternalMcpRequest(
      mcpRequest(first.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests, { sessionId: "session-b" }),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    const switched = await handleExternalMcpRequest(
      mcpRequest(
        second.key,
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { sessionId: "session-b" },
      ),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk(upstreamRequests),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(switched.status).toBe(403)
    expect(upstreamRequests).toHaveLength(1)
  })

  it("rejects browser origins outside the trusted allowlist", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Origin checked",
      resourceScope: "project:roadmap",
    })
    const response = await handleExternalMcpRequest(
      mcpRequest(
        created.key,
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { origin: "https://evil.example.test" },
      ),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk([]),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(403)
  })

  it("returns 429 with Retry-After when the provider rate limit denies the key", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Limited",
      resourceScope: "project:roadmap",
    })
    await fixture.client.execute({
      sql: `
        UPDATE apikey
        SET requestCount = 120, lastRequest = ?
        WHERE id = ?
      `,
      args: [new Date().toISOString(), created.summary.id],
    })

    const response = await handleExternalMcpRequest(
      mcpRequest(created.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      {
        credentialService: fixture.service,
        fetcher: fakeGonk([]),
        gonkServiceBearer: "internal-service-bearer",
        trustedOrigins: ["https://chat.example.test"],
      },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBeTruthy()
  })

  it("rate limits repeated invalid auth attempts by deployment and IP", async () => {
    const fixture = await createFixture()
    let response = new Response(null, { status: 204 })
    for (let index = 0; index < 31; index += 1) {
      response = await handleExternalMcpRequest(
        mcpRequest(
          `sigil_live_invalid_${index}`,
          { jsonrpc: "2.0", id: index, method: "tools/list", params: {} },
          { ip: "203.0.113.10" },
        ),
        {
          credentialService: fixture.service,
          fetcher: fakeGonk([]),
          gonkServiceBearer: "internal-service-bearer",
          trustedOrigins: ["https://chat.example.test"],
        },
      )
    }

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
  })

  it("bounds active MCP session concurrency per credential", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Concurrency",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    let response = new Response(null, { status: 204 })
    for (let index = 0; index < 5; index += 1) {
      response = await handleExternalMcpRequest(
        mcpRequest(created.key, {
          jsonrpc: "2.0",
          id: index,
          method: "initialize",
          params: {},
        }),
        {
          credentialService: fixture.service,
          fetcher: fakeGonk(upstreamRequests, { sessionId: `concurrency-${index}` }),
          gonkServiceBearer: "internal-service-bearer",
          trustedOrigins: ["https://chat.example.test"],
        },
      )
    }

    expect(response.status).toBe(429)
    expect(upstreamRequests).toHaveLength(4)
  })

  it("releases MCP session reservations when initialize returns no session", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "No session release",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []

    for (let index = 0; index < 5; index += 1) {
      const response = await handleExternalMcpRequest(
        mcpRequest(created.key, {
          jsonrpc: "2.0",
          id: index,
          method: "initialize",
          params: {},
        }),
        {
          credentialService: fixture.service,
          fetcher: fakeGonk(upstreamRequests),
          gonkServiceBearer: "internal-service-bearer",
          trustedOrigins: ["https://chat.example.test"],
        },
      )
      expect(response.status).toBe(200)
    }

    expect(upstreamRequests).toHaveLength(5)
  })

  it("releases MCP session reservations when upstream initialize fails", async () => {
    const fixture = await createFixture()
    const created = await fixture.createKey({
      name: "Failure release",
      resourceScope: "project:roadmap",
    })
    const upstreamRequests: Request[] = []
    const failingFetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? input
          : new Request(input, init)
      upstreamRequests.push(request)
      return Promise.reject(new Error("upstream down"))
    }) as typeof fetch

    for (let index = 0; index < 5; index += 1) {
      const response = await handleExternalMcpRequest(
        mcpRequest(created.key, {
          jsonrpc: "2.0",
          id: index,
          method: "initialize",
          params: {},
        }),
        {
          credentialService: fixture.service,
          fetcher: failingFetcher,
          gonkServiceBearer: "internal-service-bearer",
          trustedOrigins: ["https://chat.example.test"],
        },
      )
      expect(response.status).toBe(500)
    }

    expect(upstreamRequests).toHaveLength(5)
  })
})

async function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "sigil-external-mcp-"))
  temporaryDirectories.push(directory)
  const url = `file:${join(directory, "auth.db")}`
  const client = createClient({ url })
  const kysely = new Kysely<Record<string, unknown>>({
    dialect: new LibsqlDialect({ url }),
  })
  clients.push(client)
  databases.push(kysely)
  await client.executeMultiple(
    ["0001_better_auth.sql", "0004_external_mcp_api_keys.sql"]
      .map((filename) => readFileSync(resolve("migrations", filename), "utf8"))
      .join("\n"),
  )
  await client.execute({
    sql: `
      INSERT INTO user (
        id, name, email, emailVerified, createdAt, updatedAt,
        username, displayUsername, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      "user-1",
      "Owner",
      "owner@example.test",
      1,
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "owner",
      "owner",
      "owner",
    ],
  })
  await client.execute({
    sql: `
      INSERT INTO session (
        id, expiresAt, token, createdAt, updatedAt, userId
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      "session-1",
      "2026-07-21T12:00:00.000Z",
      "session-token-1",
      "2026-07-20T11:55:00.000Z",
      "2026-07-20T11:58:00.000Z",
      "user-1",
    ],
  })
  await client.execute({
    sql: `
      INSERT INTO account (
        id, accountId, providerId, userId, password, createdAt, updatedAt
      ) VALUES (?, ?, 'credential', ?, ?, ?, ?)
    `,
    args: [
      "account-1",
      "user-1",
      "user-1",
      await hashPassword("current-password"),
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
    ],
  })

  const environment: AuthEnvironment = {
    baseUrl: "https://chat.example.test",
    databaseUrl: url,
    installationId: "test-installation",
    isProduction: true,
    registrationOpen: false,
    secret: "test-secret-with-at-least-thirty-two-characters",
    socialProviders: {},
    trustedOrigins: ["https://chat.example.test"],
  }
  const auth = createSigilAuth({ client, environment, kysely })
  const resourceAccess = { allowed: true }
  const service = new ExternalMcpCredentialService({
    auth,
    client,
    now: () => new Date("2026-07-20T12:00:00.000Z"),
    resourceAuthorizer: () => resourceAccess.allowed,
  })
  const session: SigilAuthSession = {
    session: {
      expiresAt: new Date("2026-07-21T12:00:00.000Z"),
      id: "session-1",
    },
    user: {
      email: "owner@example.test",
      id: "user-1",
      name: "Owner",
      role: "owner",
      username: "owner",
    },
  }
  const stepUp = async () =>
    (await service.issueStepUpReceipt(session, "current-password")).receipt
  const createKey = async (input: ExternalMcpKeyCreateInput) =>
    service.create(session, input, await stepUp())
  return { auth, client, createKey, resourceAccess, service, session, stepUp }
}

function mcpRequest(
  key: string,
  body: Record<string, unknown>,
  options: {
    cookie?: string
    ip?: string
    origin?: string
    sessionId?: string
  } = {},
) {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    origin: options.origin ?? "https://chat.example.test",
  })
  if (options.cookie) headers.set("cookie", options.cookie)
  if (options.ip) headers.set("x-forwarded-for", options.ip)
  if (options.sessionId) headers.set("mcp-session-id", options.sessionId)
  return new Request("https://chat.example.test/api/mcp", {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  })
}

function fakeGonk(
  requests: Request[],
  options: { sessionId?: string } = {},
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request =
      input instanceof Request
        ? input
        : new Request(input, init)
    requests.push(request)
    const raw = request.body ? await request.clone().json() : {}
    const method =
      typeof raw === "object" && raw !== null && "method" in raw
        ? String(raw.method)
        : "unknown"
    const headers = new Headers({ "content-type": "application/json" })
    if (options.sessionId) headers.set("mcp-session-id", options.sessionId)
    if (method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            tools: [
              { name: "sigil-spec-list" },
              { name: "sigil-spec-create" },
              { name: "sigil-story-inspect" },
              { name: "sigil-image-generate" },
            ],
          },
        }),
        { headers, status: 200 },
      )
    }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      { headers, status: 200 },
    )
  }) as typeof fetch
}

function fakeGonkSse(): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(
      [
        "event: message",
        `data: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            tools: [
              { name: "sigil-spec-list" },
              { name: "sigil-spec-create" },
              { name: "sigil-image-generate" },
            ],
          },
        })}`,
        "",
      ].join("\n"),
      {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      },
    ))) as typeof fetch
}
