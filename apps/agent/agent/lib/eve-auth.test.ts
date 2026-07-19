import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose"
import type { HttpRouteDefinition } from "eve/channels"
import type { EveChannel } from "eve/channels/eve"
import { beforeAll, describe, expect, it, vi } from "vitest"

import {
  createOwnedEveChannel,
  createSigilRequestAuthenticator,
  readSigilEveAuthEnvironment,
  type SigilEveAuthEnvironment,
} from "./eve-auth"
import { MemoryEveSessionOwnerStore } from "./eve-session-owners"

const environment: SigilEveAuthEnvironment = {
  allowLocalDev: false,
  audience: "sigil-chat-agent",
  installationId: "installation-1",
  isProduction: false,
  issuer: "https://chat.example.test",
  jwksUrl: "https://chat.example.test/api/auth/jwks",
}

let privateKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA")
  privateKey = pair.privateKey
  const publicKey = await exportJWK(pair.publicKey)
  jwks = createLocalJWKSet({
    keys: [{ ...publicKey, alg: "EdDSA", kid: "test-key", use: "sig" }],
  })
})

describe("Sigil Eve JWT authentication", () => {
  it("constructs the Eve caller only from verified required claims", async () => {
    const authenticate = createSigilRequestAuthenticator(environment, { jwks })
    const token = await signToken()

    await expect(
      authenticate(
        new Request("https://agent.example.test/eve/v1/session", {
          headers: { authorization: `Bearer ${token}` },
          method: "POST",
        }),
      ),
    ).resolves.toMatchObject({
      attributes: {
        sigilInstallationId: "installation-1",
        sigilRole: "owner",
      },
      authenticator: "jwt-jwks",
      issuer: "https://chat.example.test",
      principalId: "user-1",
      principalType: "user",
      subject: "user-1",
    })
  })

  it("rejects wrong audience, issuer, installation, expiry, and lifetime", async () => {
    const authenticate = createSigilRequestAuthenticator(environment, { jwks })
    const now = Math.floor(Date.now() / 1000)
    const tokens = await Promise.all([
      signToken({ audience: "other-agent" }),
      signToken({ issuer: "https://other.example.test" }),
      signToken({ installationId: "other-installation" }),
      signToken({ expiresAt: now - 1, issuedAt: now - 301 }),
      signToken({ expiresAt: now + 301, issuedAt: now }),
    ])

    for (const token of tokens) {
      await expect(
        authenticate(
          new Request("https://agent.example.test/eve/v1/session", {
            headers: { authorization: `Bearer ${token}` },
          }),
        ),
      ).resolves.toBeNull()
    }
  })

  it("rejects missing, malformed, and unsupported-role credentials", async () => {
    const authenticate = createSigilRequestAuthenticator(environment, { jwks })
    const requests = [
      new Request("https://agent.example.test/eve/v1/session"),
      new Request("https://agent.example.test/eve/v1/session", {
        headers: { authorization: "Bearer not-a-jwt" },
      }),
      new Request("https://agent.example.test/eve/v1/session", {
        headers: {
          authorization: `Bearer ${await signToken({ role: "admin" })}`,
        },
      }),
    ]

    for (const request of requests) {
      await expect(authenticate(request)).resolves.toBeNull()
    }
  })

  it("requires an explicit non-production flag for localDev auth", async () => {
    const disabled = createSigilRequestAuthenticator(environment, { jwks })
    await expect(
      disabled(new Request("http://localhost/eve/v1/session")),
    ).resolves.toBeNull()

    const enabled = createSigilRequestAuthenticator(
      { ...environment, allowLocalDev: true },
      { jwks },
    )
    await expect(
      enabled(new Request("http://localhost/eve/v1/session")),
    ).resolves.toMatchObject({
      authenticator: "local-dev",
      principalId: "local-dev",
    })
  })

  it("refuses to enable the local bypass in production", () => {
    expect(() =>
      readSigilEveAuthEnvironment({
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH: "1",
        SIGIL_INSTALLATION_ID: "installation-1",
      }),
    ).toThrow("cannot be enabled in production")
  })
})

describe("owned Eve channel", () => {
  it("binds a newly created Eve session before returning its id", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    const channel = makeOwnedChannel(ownerStore)
    const send = vi.fn(async () => ({
      continuationToken: "eve:continuation-1",
      id: "session-1",
    }))
    const route = findRoute(channel, "POST", "/eve/v1/session")

    const response = await route.handler(
      requestFor("POST", "/eve/v1/session", "user-1", {
        message: "Hello",
      }),
      routeArgs({ send }),
    )

    expect(response.status).toBe(202)
    await expect(ownerStore.getOwner("session-1")).resolves.toBe("user-1")
  })

  it("allows the owner to continue and rejects a different caller before dispatch", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind("session-1", "user-1")
    const channel = makeOwnedChannel(ownerStore)
    const route = findRoute(channel, "POST", "/eve/v1/session/:sessionId")
    const allowedSend = vi.fn(async () => ({ id: "session-1" }))

    const allowed = await route.handler(
      requestFor("POST", "/eve/v1/session/session-1", "user-1", {
        continuationToken: "eve:continuation-1",
        message: "Continue",
      }),
      routeArgs({ params: { sessionId: "session-1" }, send: allowedSend }),
    )
    expect(allowed.status).toBe(200)
    expect(allowedSend).toHaveBeenCalledOnce()

    const deniedSend = vi.fn()
    const deniedGetSession = vi.fn()
    const denied = await route.handler(
      requestFor("POST", "/eve/v1/session/session-1", "user-2", {
        continuationToken: "eve:continuation-1",
        inputResponses: [{ id: "input-1", value: "approved" }],
      }),
      routeArgs({
        getSession: deniedGetSession,
        params: { sessionId: "session-1" },
        send: deniedSend,
      }),
    )
    expect(denied.status).toBe(403)
    expect(deniedGetSession).not.toHaveBeenCalled()
    expect(deniedSend).not.toHaveBeenCalled()
  })

  it("rejects cross-owner event-stream reads before resolving the session", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind("session-1", "user-1")
    const channel = makeOwnedChannel(ownerStore)
    const route = findRoute(channel, "GET", "/eve/v1/session/:sessionId/stream")
    const getSession = vi.fn()

    const response = await route.handler(
      requestFor("GET", "/eve/v1/session/session-1/stream", "user-2"),
      routeArgs({ getSession, params: { sessionId: "session-1" } }),
    )

    expect(response.status).toBe(403)
    expect(getSession).not.toHaveBeenCalled()
  })

  it("fails closed when an existing Eve session has no persisted owner", async () => {
    const channel = makeOwnedChannel(new MemoryEveSessionOwnerStore())
    const route = findRoute(channel, "POST", "/eve/v1/session/:sessionId")
    const send = vi.fn()

    const response = await route.handler(
      requestFor("POST", "/eve/v1/session/legacy-session", "user-1", {
        continuationToken: "eve:continuation-1",
        message: "Continue",
      }),
      routeArgs({ params: { sessionId: "legacy-session" }, send }),
    )

    expect(response.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })
})

async function signToken(
  overrides: {
    audience?: string
    expiresAt?: number
    installationId?: string
    issuedAt?: number
    issuer?: string
    role?: string
    subject?: string
  } = {},
) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    installationId: overrides.installationId ?? "installation-1",
    role: overrides.role ?? "owner",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setAudience(overrides.audience ?? environment.audience)
    .setExpirationTime(overrides.expiresAt ?? now + 300)
    .setIssuedAt(overrides.issuedAt ?? now)
    .setIssuer(overrides.issuer ?? environment.issuer)
    .setSubject(overrides.subject ?? "user-1")
    .sign(privateKey)
}

function makeOwnedChannel(ownerStore: MemoryEveSessionOwnerStore) {
  return createOwnedEveChannel({
    auth: (request) => {
      const subject = request.headers.get("x-test-subject")
      if (!subject) return null
      return {
        attributes: {},
        authenticator: "test",
        issuer: "test",
        principalId: subject,
        principalType: "user",
        subject,
      }
    },
    ownerStore,
  })
}

function findRoute(channel: EveChannel, method: "GET" | "POST", path: string) {
  const route = channel.routes.find(
    (candidate): candidate is HttpRouteDefinition =>
      candidate.transport !== "websocket" &&
      candidate.method === method &&
      candidate.path === path,
  )
  if (!route) throw new Error(`Missing ${method} ${path}`)
  return route
}

function requestFor(
  method: "GET" | "POST",
  path: string,
  subject: string,
  body?: unknown,
) {
  return new Request(`http://localhost${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-test-subject": subject,
    },
    method,
  })
}

function routeArgs(
  overrides: {
    getSession?: ReturnType<typeof vi.fn>
    params?: Record<string, string>
    send?: ReturnType<typeof vi.fn>
  } = {},
) {
  return {
    getSession:
      overrides.getSession ??
      vi.fn(() => ({
        getEventStream: async () => new ReadableStream(),
      })),
    params: overrides.params ?? {},
    receive: vi.fn(),
    requestIp: null,
    send:
      overrides.send ??
      vi.fn(async () => ({
        continuationToken: "eve:continuation-1",
        id: "session-1",
      })),
    waitUntil: vi.fn(),
  } as never
}
