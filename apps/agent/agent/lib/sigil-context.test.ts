import { describe, expect, it, vi } from "vitest"
import {
  ContextCompiler,
  ContextContributorRegistry,
  type ContextContributor,
} from "@gonk/context"
import type { AuthorizationRequest } from "@gonk/auth"
import type { ManagedSkillRegistry } from "@gonk/skills"
import { eveChannel } from "eve/channels/eve"
import {
  createRetrievalContextContributor,
  createSigilEveOnMessage,
  createSkillContextContributor,
} from "./sigil-context"

const SESSION_AUTH = {
  attributes: {},
  authenticator: "test",
  principalId: "user-1",
  principalType: "user",
}

describe("Sigil Eve context integration", () => {
  it("adds deterministically selected authorized skill context to the next model turn", async () => {
    const channel = testChannel({
      compiler: compilerWith([
        createSkillContextContributor({ registry: skillRegistry() }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Can you check @editorial-readiness for this draft?",
      clientContext: "client-declared attention",
    })

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledOnce()
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("Client context:")
    expect(JSON.stringify(payload)).toContain("Managed skill: editorial-readiness")
    expect(JSON.stringify(payload)).toContain("AUTHORIZED_EDITORIAL_CONTEXT")
  })

  it("does not bulk-inject skills when none are required or deterministically matched", async () => {
    const channel = testChannel({
      compiler: compilerWith([
        createSkillContextContributor({ registry: skillRegistry() }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Hello, no skill should be attached here.",
    })

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledOnce()
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("AUTHORIZED_EDITORIAL_CONTEXT")
  })

  it("injects the session blackboard into every turn (S3.2)", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: { sigilResourceScope: "session:sess-1" },
      },
      compiler: compilerWith([]),
      readBlackboard: async (sessionId) =>
        sessionId === "sess-1"
          ? "TODO: ship the thing — BLACKBOARD_MARKER"
          : "",
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, { message: "hi" })

    expect(response.status).toBe(202)
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("Shared blackboard")
    expect(JSON.stringify(payload)).toContain("BLACKBOARD_MARKER")
  })

  it("does not inject a blackboard for non-session scopes", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: { sigilResourceScope: "project:proj-1" },
      },
      compiler: compilerWith([]),
      readBlackboard: async () => "SHOULD_NOT_APPEAR",
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "hi" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("SHOULD_NOT_APPEAR")
  })

  it("does not leak denied context", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: { sigilContextDeny: "skill:editorial-readiness" },
      },
      compiler: compilerWith([
        createSkillContextContributor({
          registry: skillRegistry(),
          requiredSkillIds: ["editorial-readiness"],
        }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Can you check editorial readiness?",
      clientContext: "client context cannot authorize SERVER_SECRET",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it("refuses dispatch when required compilation is blocked", async () => {
    const channel = testChannel({
      compiler: compilerWith([
        createSkillContextContributor({ registry: skillRegistry() }),
      ]),
      pinnedResourceKeys: ["skill:missing-required-context"],
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "This turn requires missing context.",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it("fails closed when a configured required skill is missing without pinned resource keys", async () => {
    const channel = testChannel({
      compiler: compilerWith([
        createSkillContextContributor({
          registry: skillRegistry(),
          requiredSkillIds: ["missing-editorial-gate"],
        }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "This should not dispatch without the required server skill.",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it("fails closed when required skill discovery is unavailable", async () => {
    const channel = testChannel({
      compiler: compilerWith([
        createSkillContextContributor({
          registry: throwingSkillRegistry(),
          requiredSkillIds: ["editorial-readiness"],
        }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "This should not dispatch while required skill discovery fails.",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })


  it("fails closed for unsupported principal types", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        principalType: "anonymous",
      },
      compiler: compilerWith([
        createSkillContextContributor({ registry: skillRegistry() }),
      ]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Can you check @editorial-readiness?",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it("allows same-tenant context resources from trusted server auth claims", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: { sigilTenantId: "tenant-a" },
      },
      compiler: compilerWith([tenantContextContributor("tenant-a")]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Attach tenant launch context.",
    })

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledOnce()
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("TENANT_BOUND_CONTEXT")
  })

  it("denies cross-tenant context resources during final context authorization", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: { sigilTenantId: "tenant-a" },
      },
      compiler: compilerWith([tenantContextContributor("tenant-b")]),
    })
    const send = vi.fn(async () => session())

    const response = await postSession(channel, send, {
      message: "Attach tenant launch context.",
    })

    expect(response.status).toBe(204)
    expect(send).not.toHaveBeenCalled()
  })

  it("passes the captured request auth through retrieval instead of widening from principal", async () => {
    const observedOutcomes: string[] = []
    const registry = new ContextContributorRegistry()
    registry.register(
      createRetrievalContextContributor({
        authForRequestId: () => ({
          principal: {
            id: "user-1",
            kind: "human",
            identity: { issuer: "test", subject: "user-1", method: "session" },
            roles: [],
            scopes: [],
          },
          authorize: (request: AuthorizationRequest) => ({
            outcome:
              request.resource.target === "retrieval-probe" ? "deny" : "allow",
            reason: "test policy",
          }),
        }),
        engine: {
          async search(request) {
            const decision = await request.auth.authorize({
              action: "retrieval.content.resolve",
              resource: {
                kind: "retrieval-resource",
                target: "retrieval-probe",
              },
            })
            observedOutcomes.push(decision.outcome)
            return {
              hits: [],
              receipt: {
                kind: "retrieval-search",
                receiptVersion: 1,
                requestId: request.requestId,
                timestamp: new Date(0).toISOString(),
                mode: "lexical",
                purpose: "agent-recall",
                outcome: "success",
                sources: [],
                visibleHits: [],
                drops: [],
              },
            }
          },
          async resolve() {
            throw new Error("resolve should not be reached")
          },
        },
      }),
    )

    const compiler = new ContextCompiler({
      registry,
      tokenCounter,
      configVersion: "test",
    })

    await compiler.compile({
      requestId: "retrieval-auth-request",
      audience: "model",
      auth: {
        principal: {
          id: "user-1",
          kind: "human",
          identity: { issuer: "test", subject: "user-1", method: "session" },
          roles: [],
          scopes: [],
        },
        authorize: () => ({ outcome: "allow", reason: "outer policy" }),
      },
      maxTokens: 1_000,
      query: "find retrieval context",
    })

    expect(observedOutcomes).toEqual(["deny"])
  })
})

function testChannel(options: {
  auth?: typeof SESSION_AUTH
  compiler: ContextCompiler
  pinnedResourceKeys?: readonly string[]
  readBlackboard?: (sessionId: string) => Promise<string>
}) {
  return eveChannel({
    auth: [() => options.auth ?? SESSION_AUTH],
    onMessage: createSigilEveOnMessage({
      compiler: options.compiler,
      pinnedResourceKeys: options.pinnedResourceKeys,
      readBlackboard: options.readBlackboard,
    }),
  })
}

async function postSession(
  channel: ReturnType<typeof eveChannel>,
  send: ReturnType<typeof vi.fn>,
  body: unknown,
) {
  const route = channel.routes.find(
    (route) => route.method === "POST" && route.path === "/eve/v1/session",
  )
  if (route === undefined || route.transport === "websocket") {
    throw new Error("Eve session route not found")
  }

  return route.handler(
    new Request("http://localhost/eve/v1/session", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    {
      send,
      getSession: () => {
        throw new Error("getSession should not be called")
      },
      receive: async () => {
        throw new Error("receive should not be called")
      },
      cancel: async () => ({ status: "no_active_turn" }),
      params: {},
      waitUntil: () => {},
      requestIp: null,
    },
  )
}

function compilerWith(contributors: Parameters<ContextContributorRegistry["register"]>[0][]) {
  const registry = new ContextContributorRegistry()
  for (const contributor of contributors) registry.register(contributor)
  return new ContextCompiler({
    registry,
    tokenCounter,
    configVersion: "test",
  })
}

const tokenCounter = {
  async count(input: { content: string }) {
    return { tokens: Math.max(1, Math.ceil(input.content.length / 4)), quality: "fallback" as const }
  },
}

function skillRegistry(): ManagedSkillRegistry {
  return {
    async list() {
      return {
        status: "ok",
        skills: [
          {
            id: "editorial-readiness",
            description: "Use when assessing draft publish readiness.",
            origin: { kind: "workspace", adapterId: "test" },
            scope: "project",
            lifecycle: "active",
            capabilities: ["read", "activate"],
            revision:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            contentHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        ],
      }
    },
    async get(request) {
      if (request.id !== "editorial-readiness") {
        return { status: "not-found", id: request.id }
      }
      return {
        status: "found",
        skill: {
          id: "editorial-readiness",
          description: "Use when assessing draft publish readiness.",
          origin: { kind: "workspace", adapterId: "test" },
          scope: "project",
          lifecycle: "active",
          capabilities: ["read", "activate"],
          revision:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          contentHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          body: "AUTHORIZED_EDITORIAL_CONTEXT\nCheck outline, sources, decisions, and annotations.",
          supportingFiles: [],
          otherDefinitions: [],
        },
      }
    },
    async resolve(request) {
      const result = await this.get({ id: request.id })
      if (result.status === "not-found") return result
      return {
        status: "found",
        id: request.id,
        active: result.skill,
        definitions: [result.skill],
      }
    },
    async read(request) {
      const result = await this.get({ id: request.id })
      if (result.status === "not-found") {
        return {
          status: "not-found",
          id: request.id,
          path: request.path ?? "SKILL.md",
          reason: "skill-not-found",
        }
      }
      return {
        status: "found",
        id: request.id,
        scope: "project",
        path: "SKILL.md",
        content: result.skill.body,
        contentHash: result.skill.contentHash,
        skillRevision: result.skill.revision,
        mediaType: "text/markdown",
      }
    },
  }
}

function throwingSkillRegistry(): ManagedSkillRegistry {
  return {
    async list() {
      throw new Error("skill registry unavailable")
    },
    async get(request) {
      return { status: "not-found", id: request.id }
    },
    async resolve(request) {
      return { status: "not-found", id: request.id }
    },
    async read(request) {
      return {
        status: "not-found",
        id: request.id,
        path: request.path ?? "SKILL.md",
        reason: "skill-not-found",
      }
    },
  }
}

function session() {
  return { id: "session-1", continuationToken: "eve:test" } as never
}

function firstSendCall(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls[0] as [unknown, ...unknown[]]
}

function tenantContextContributor(tenantId: string): ContextContributor {
  return {
    id: "test.tenant-context",
    discover() {
      return [
        {
          candidateId: `tenant-context:${tenantId}`,
          contributorId: "test.tenant-context",
          resourceKey: "tenant-context:launch",
          necessity: "required",
          priority: 100,
          estimatedTokens: 10,
          estimateQuality: "fallback",
        },
      ]
    },
    resolve(request) {
      return {
        candidateId: request.candidate.candidateId,
        contributorId: request.candidate.contributorId,
        resourceKey: request.candidate.resourceKey,
        revision: "tenant-test-v1",
        necessity: request.candidate.necessity,
        priority: request.candidate.priority,
        audience: request.audience,
        content: "TENANT_BOUND_CONTEXT",
        resource: {
          kind: "context-candidate",
          target: request.candidate.resourceKey,
          tenantId,
        },
      }
    },
  }
}
