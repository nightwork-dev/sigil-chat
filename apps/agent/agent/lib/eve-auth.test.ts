import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose"
import type { HttpRouteDefinition } from "eve/channels"
import { ForbiddenError } from "eve/channels/auth"
import type { EveChannel } from "eve/channels/eve"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

import {
  createOwnedEveChannel,
  createSigilRequestAuthenticator,
  readSigilEveAuthEnvironment,
  type SigilEveAuthEnvironment,
  type CreateOwnedEveChannelOptions,
} from "./eve-auth"
import { MemoryEveSessionOwnerStore } from "./eve-session-owners"
import {
  EveSessionBindingVerificationError,
  requireVerifiedEveSessionBinding,
} from "./eve-session-binding"

const environment: SigilEveAuthEnvironment = {
  allowLocalDev: false,
  audience: "sigil-chat-agent",
  installationId: "installation-1",
  isProduction: false,
  issuer: "https://chat.example.test",
  jwksUrl: "https://chat.example.test/api/auth/jwks",
}
const SESSION_BINDING_SECRET = "test-session-binding-secret"
const SESSION_BINDING_NOW = 1_750_000_000

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

  it("binds the selected persona and rejects persona switching on continuation", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    const observedPersonas: string[] = []
    const channel = makeOwnedChannel(ownerStore, (context) => {
      const caller = context.eve.caller
      if (!caller) return null
      const personaId = caller.attributes.sigilPersonaId
      if (typeof personaId === "string") observedPersonas.push(personaId)
      return { auth: caller }
    })
    const createRoute = findRoute(channel, "POST", "/eve/v1/session")

    const created = await createRoute.handler(
      requestFor(
        "POST",
        "/eve/v1/session",
        "user-1",
        { message: "Hello" },
        "agent-b",
      ),
      routeArgs(),
    )

    expect(created.status).toBe(202)
    await expect(ownerStore.getBinding("session-1")).resolves.toEqual({
      additionalContextScopeIds: [],
      applicationThreadId: "thread-1",
      homeScopeId: "workspace-a",
      initialPerspective: {
        focusScopeId: "workspace-a",
        viaScopeIds: ["project-a"],
      },
      personaId: "agent-b",
      subject: "user-1",
    })
    expect(observedPersonas).toEqual(["agent-b"])

    const continueRoute = findRoute(
      channel,
      "POST",
      "/eve/v1/session/:sessionId",
    )
    const send = vi.fn()
    const denied = await continueRoute.handler(
      requestFor(
        "POST",
        "/eve/v1/session/session-1",
        "user-1",
        { continuationToken: "eve:continuation-1", message: "Switch" },
        "agent-a",
      ),
      routeArgs({ params: { sessionId: "session-1" }, send }),
    )

    expect(denied.status).toBe(403)
    expect(send).not.toHaveBeenCalled()

    const allowedSend = vi.fn(async () => ({ id: "session-1" }))
    const allowed = await continueRoute.handler(
      requestFor(
        "POST",
        "/eve/v1/session/session-1",
        "user-1",
        {
          continuationToken: "eve:continuation-1",
          message: "Continue",
        },
        "agent-b",
      ),
      routeArgs({ params: { sessionId: "session-1" }, send: allowedSend }),
    )

    expect(allowed.status).toBe(200)
    expect(observedPersonas).toEqual(["agent-b", "agent-b"])
  })

  it("allows the owner to continue and rejects a different caller before dispatch", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind("session-1", "user-1", "agent-a")
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
    await ownerStore.bind("session-1", "user-1", "agent-a")
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

  it("rejects a different application thread or home on continuation", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind(
      "session-1",
      "user-1",
      "agent-a",
      executionBindingFor("agent-a"),
    )
    const channel = makeOwnedChannel(ownerStore)
    const route = findRoute(channel, "POST", "/eve/v1/session/:sessionId")
    const send = vi.fn()

    const response = await route.handler(
      requestFor(
        "POST",
        "/eve/v1/session/session-1",
        "user-1",
        { continuationToken: "eve:continuation-1", message: "Continue" },
        "agent-a",
        { threadId: "thread-other" },
      ),
      routeArgs({ params: { sessionId: "session-1" }, send }),
    )

    expect(response.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it("requires the execution attestation after a session reaches V3", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind(
      "session-1",
      "user-1",
      "agent-a",
      executionBindingFor("agent-a"),
    )
    const channel = makeOwnedChannel(ownerStore)
    const route = findRoute(channel, "POST", "/eve/v1/session/:sessionId")
    const send = vi.fn()

    const response = await route.handler(
      requestFor(
        "POST",
        "/eve/v1/session/session-1",
        "user-1",
        { continuationToken: "eve:continuation-1", message: "Continue" },
        "agent-a",
        { omitBinding: true },
      ),
      routeArgs({ params: { sessionId: "session-1" }, send }),
    )

    expect(response.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it("preserves the current request scope into runtime auth after onMessage", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    const channel = createOwnedEveChannel({
      auth: (request) => {
        const subject = request.headers.get("x-test-subject")
        if (!subject) return null
        return {
          attributes: {
            sigilResourceScope: request.headers.get("x-sigil-scope") ?? "",
            sigilScopeProof: "browser-proof",
            sigilExecutionBinding: JSON.stringify(
              executionBindingFor("agent-a"),
            ),
          },
          authenticator: "test",
          issuer: "test",
          principalId: subject,
          principalType: "user",
          subject,
        }
      },
      defaultPersonaId: "agent-a",
      onMessage: (context) => {
        const caller = context.eve.caller
        if (!caller) return null
        return {
          // A context compiler may return a narrowed projection. The channel
          // must still carry the authoritative request scope into this turn.
          auth: {
            ...caller,
            attributes: { sigilScopeProof: "eve-session-bound-proof" },
          },
        }
      },
      ownerStore,
    })
    const route = findRoute(channel, "POST", "/eve/v1/session")
    const send = vi.fn(async () => ({
      continuationToken: "eve:continuation-1",
      id: "session-1",
    }))

    const response = await route.handler(
      new Request("http://localhost/eve/v1/session", {
        body: JSON.stringify({ message: "Hello" }),
        headers: {
          "content-type": "application/json",
          "x-sigil-scope": "project:evidence-room",
          "x-test-subject": "user-1",
        },
        method: "POST",
      }),
      routeArgs({ send }),
    )

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        auth: expect.objectContaining({
          attributes: expect.objectContaining({
            sigilResourceScope: "project:evidence-room",
            sigilScopeProof: "eve-session-bound-proof",
          }),
        }),
      }),
    )
  })

  it("enforces signed bindings across create, continuation, and stream routes", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    const channel = makeSignedOwnedChannel(ownerStore)
    const createRoute = findRoute(channel, "POST", "/eve/v1/session")
    const continuationRoute = findRoute(
      channel,
      "POST",
      "/eve/v1/session/:sessionId",
    )
    const streamRoute = findRoute(
      channel,
      "GET",
      "/eve/v1/session/:sessionId/stream",
    )
    const createProof = signedSessionBinding()

    const created = await createRoute.handler(
      signedRequest("POST", "/eve/v1/session", createProof, {
        message: "Hello",
      }),
      routeArgs(),
    )
    expect(created.status).toBe(202)

    const streamed = await streamRoute.handler(
      signedRequest("GET", "/eve/v1/session/session-1/stream", createProof),
      routeArgs({ params: { sessionId: "session-1" } }),
    )
    expect(streamed.status).toBe(200)

    const continued = await continuationRoute.handler(
      signedRequest(
        "POST",
        "/eve/v1/session/session-1",
        signedSessionBinding({ eveSessionId: "session-1" }),
        { continuationToken: "eve:continuation-1", message: "Continue" },
      ),
      routeArgs({ params: { sessionId: "session-1" } }),
    )
    expect(continued.status).toBe(200)
  })

  it("rejects cross-thread replay while upgrading a legacy session", async () => {
    const ownerStore = new MemoryEveSessionOwnerStore()
    await ownerStore.bind("legacy-session", "user-1", "agent-a")
    const channel = makeSignedOwnedChannel(ownerStore)
    const route = findRoute(channel, "POST", "/eve/v1/session/:sessionId")
    const send = vi.fn()

    const denied = await route.handler(
      signedRequest(
        "POST",
        "/eve/v1/session/legacy-session",
        signedSessionBinding({ applicationThreadId: "thread-other" }),
        { continuationToken: "eve:continuation-1", message: "Continue" },
      ),
      routeArgs({ params: { sessionId: "legacy-session" }, send }),
    )

    expect(denied.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
    await expect(ownerStore.getBinding("legacy-session")).resolves.toEqual({
      personaId: "agent-a",
      subject: "user-1",
    })
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

function makeSignedOwnedChannel(ownerStore: MemoryEveSessionOwnerStore) {
  return createOwnedEveChannel({
    auth: (request) => {
      const subject = request.headers.get("x-test-subject")
      if (!subject) return null
      try {
        const binding = requireVerifiedEveSessionBinding(
          request,
          subject,
          SESSION_BINDING_SECRET,
          SESSION_BINDING_NOW,
        )
        return {
          attributes: binding
            ? {
                sigilExecutionBinding: JSON.stringify({
                  additionalContextScopeIds: binding.additionalContextScopeIds,
                  applicationThreadId: binding.applicationThreadId,
                  homeScopeId: binding.homeScopeId,
                  initialPerspective: binding.initialPerspective,
                  personaId: binding.personaId,
                }),
                sigilRequestedPersonaId: binding.personaId,
                ...(binding.eveSessionId
                  ? { sigilAttestedEveSessionId: binding.eveSessionId }
                  : {}),
              }
            : {},
          authenticator: "signed-test",
          issuer: "test",
          principalId: subject,
          principalType: "user",
          subject,
        }
      } catch (error) {
        if (!(error instanceof EveSessionBindingVerificationError)) throw error
        throw new ForbiddenError({
          code: "eve_session_binding_invalid",
          message: error.message,
        })
      }
    },
    defaultPersonaId: "agent-a",
    ownerStore,
  })
}

function signedSessionBinding(
  overrides: {
    applicationThreadId?: string
    eveSessionId?: string
  } = {},
) {
  return issueAgentSessionBinding(
    {
      additionalContextScopeIds: [],
      applicationThreadId: overrides.applicationThreadId ?? "thread-1",
      ...(overrides.eveSessionId
        ? { eveSessionId: overrides.eveSessionId }
        : {}),
      expiresAt: SESSION_BINDING_NOW + 60,
      homeScopeId: "workspace-a",
      initialPerspective: {
        focusScopeId: "workspace-a",
        viaScopeIds: ["project-a"],
      },
      personaId: "agent-a",
      subject: "user-1",
    },
    SESSION_BINDING_SECRET,
  )
}

function signedRequest(
  method: "GET" | "POST",
  path: string,
  proof: string,
  body?: unknown,
) {
  return new Request(`http://localhost${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-sigil-session-binding": proof,
      "x-test-subject": "user-1",
    },
    method,
  })
}

function makeOwnedChannel(
  ownerStore: MemoryEveSessionOwnerStore,
  onMessage?: CreateOwnedEveChannelOptions["onMessage"],
) {
  return createOwnedEveChannel({
    auth: (request) => {
      const subject = request.headers.get("x-test-subject")
      if (!subject) return null
      const requestedPersonaId = request.headers.get("x-sigil-persona-id")
      const executionBinding = request.headers.get("x-test-omit-binding")
        ? undefined
        : executionBindingFor(
            requestedPersonaId ?? "agent-a",
            request.headers.get("x-test-thread-id") ?? "thread-1",
          )
      const routeSessionId = /^\/eve\/v1\/session\/([^/]+)/.exec(
        new URL(request.url).pathname,
      )?.[1]
      const attestedEveSessionId = request.headers.get("x-test-eve-session-id")
      return {
        attributes: {
          ...(requestedPersonaId
            ? { sigilRequestedPersonaId: requestedPersonaId }
            : {}),
          ...(executionBinding
            ? { sigilExecutionBinding: JSON.stringify(executionBinding) }
            : {}),
          ...(!request.headers.get("x-test-omit-eve-session-id") &&
          (attestedEveSessionId || routeSessionId)
            ? {
                sigilAttestedEveSessionId:
                  attestedEveSessionId ?? routeSessionId,
              }
            : {}),
        },
        authenticator: "test",
        issuer: "test",
        principalId: subject,
        principalType: "user",
        subject,
      }
    },
    defaultPersonaId: "agent-a",
    onMessage,
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
  personaId?: string,
  binding?: {
    eveSessionId?: string
    omitBinding?: boolean
    omitEveSessionId?: boolean
    threadId?: string
  },
) {
  return new Request(`http://localhost${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(personaId ? { "x-sigil-persona-id": personaId } : {}),
      ...(binding?.omitBinding ? { "x-test-omit-binding": "1" } : {}),
      ...(binding?.omitEveSessionId
        ? { "x-test-omit-eve-session-id": "1" }
        : {}),
      ...(binding?.eveSessionId
        ? { "x-test-eve-session-id": binding.eveSessionId }
        : {}),
      ...(binding?.threadId ? { "x-test-thread-id": binding.threadId } : {}),
      "x-test-subject": subject,
    },
    method,
  })
}

function executionBindingFor(
  personaId: string,
  applicationThreadId = "thread-1",
) {
  return {
    applicationThreadId,
    personaId,
    homeScopeId: "workspace-a",
    initialPerspective: {
      focusScopeId: "workspace-a",
      viaScopeIds: ["project-a"],
    },
    additionalContextScopeIds: [],
  }
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
