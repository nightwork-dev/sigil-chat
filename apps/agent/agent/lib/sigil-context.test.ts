import { describe, expect, it, vi } from "vitest"
import {
  ContextCompiler,
  ContextContributorRegistry,
  type ContextContributor,
} from "@gonk/context"
import type { ManagedSkillRegistry } from "@gonk/skills"
import { MAX_BLACKBOARD_CONTENT_CHARS } from "@workspace/blackboard-store/limits"
import { eveChannel } from "eve/channels/eve"
import {
  blackboardContextBlock,
  contextFitsBudget,
  createDefaultSigilContextCompiler,
  createSigilEveOnMessage,
  createSkillContextContributor,
  type SigilContextOptions,
} from "./sigil-context"

const SESSION_AUTH = {
  attributes: { sigilPersonaId: "agent-a" } as Record<string, string>,
  authenticator: "test",
  principalId: "user-1",
  principalType: "user",
}

describe("Sigil Eve context integration", () => {
  it("omits oversized legacy blackboards from turn context", () => {
    expect(
      blackboardContextBlock("x".repeat(MAX_BLACKBOARD_CONTENT_CHARS + 1)),
    ).toBeUndefined()
    expect(blackboardContextBlock("Shared note")).toContain("Shared note")
  })

  it("keeps appended context inside the turn budget", async () => {
    await expect(contextFitsBudget("x".repeat(100), 24)).resolves.toBe(false)
    await expect(contextFitsBudget("x".repeat(100), 25)).resolves.toBe(true)
  })

  it("does not advertise retrieval when the default compiler has no retrieval source", async () => {
    const compiler = createDefaultSigilContextCompiler({
      agentProjectRoot: process.cwd(),
      tokenCounter,
    })

    const result = await compiler.compile({
      requestId: "default-retrieval-source-check",
      audience: "model",
      auth: {
        principal: {
          id: "user-1",
          kind: "human",
          identity: { issuer: "test", subject: "user-1", method: "session" },
          roles: [],
          scopes: [],
        },
        authorize: () => ({ outcome: "allow", reason: "test policy" }),
      },
      maxTokens: 1_000,
      query: "find project context",
      requestedContributorIds: ["sigil.retrieval"],
    })

    expect(result.status).toBe("ready")
    expect(result.receipt.selected).toEqual([])
    expect(result.receipt.dropped).toContainEqual({
      reason: "contributor-failed",
      contributorId: "sigil.retrieval",
    })
  })

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
    expect(JSON.stringify(payload)).toContain(
      "Managed skill: editorial-readiness",
    )
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
    expect(JSON.stringify(payload)).not.toContain(
      "AUTHORIZED_EDITORIAL_CONTEXT",
    )
  })

  it("uses a non-blank provisional identity when Eve has not assigned a session id yet", async () => {
    const identities: Array<{
      eveSessionId: string
      personaId: string
      principalId: string
    }> = []
    const channel = testChannel({
      compiler: compilerWith([]),
      identityFloor: (identity) => {
        identities.push(identity)
        return "IDENTITY_FLOOR"
      },
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "hello" })

    expect(identities).toEqual([
      {
        eveSessionId: "new:user-1",
        personaId: "agent-a",
        principalId: "user-1",
      },
    ])
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("IDENTITY_FLOOR")
  })

  it("adds host-authorized recall only to the latest model turn", async () => {
    const recalls: Array<{
      eveSessionId: string
      personaId: string
      principalId: string
      query: string
    }> = []
    const channel = testChannel({
      compiler: compilerWith([]),
      identityFloor: () => "STABLE_IDENTITY_FLOOR",
      recallLatestTurn: (input) => {
        recalls.push(input)
        return "## Relevant memory\n- The launch code word is marigold."
      },
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, {
      message: "What is the launch code word?",
    })

    expect(recalls).toEqual([
      {
        eveSessionId: "new:user-1",
        personaId: "agent-a",
        principalId: "user-1",
        query: "What is the launch code word?",
        activeResourceScope: undefined,
        targetAudience: { kind: "personal", principalId: "user-1" },
      },
    ])
    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("STABLE_IDENTITY_FLOOR")
    expect(JSON.stringify(payload)).toContain("marigold")
  })

  it("adds labelled recall when its audience and sources are still authorized", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () =>
        scopedRecall({
          audience: { kind: "scope", scopeId: "workspace:ws-1" },
          sources: [{ scopeId: "workspace:ws-1", resourceKey: "doc:launch" }],
          content: "## Relevant memory\n- LABELLED_ALLOWED_RECALL",
        }),
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "What do we remember?" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("LABELLED_ALLOWED_RECALL")
  })

  it("quarantines labelled recall when a source is revoked or denied", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
          sigilContextDeny: "doc:launch",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () =>
        scopedRecall({
          audience: { kind: "scope", scopeId: "workspace:ws-1" },
          sources: [{ scopeId: "workspace:ws-1", resourceKey: "doc:launch" }],
          content: "## Relevant memory\n- REVOKED_SOURCE_RECALL",
        }),
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "What do we remember?" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("REVOKED_SOURCE_RECALL")
  })

  it("quarantines the whole combined recall block when any mixed source is denied", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
          sigilContextDeny: "doc:denied",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () => ({
        content:
          "## Relevant memory\n- ALLOWED_PART\n- DENIED_PART_SHOULD_HIDE_ALL",
        selectedRecordIds: ["memory-1", "memory-2"],
        records: [
          {
            id: "memory-1",
            labels: {
              legacy: false,
              audience: { kind: "scope", scopeId: "workspace:ws-1" },
              sources: [
                { scopeId: "workspace:ws-1", resourceKey: "doc:allowed" },
              ],
            },
          },
          {
            id: "memory-2",
            labels: {
              legacy: false,
              audience: { kind: "scope", scopeId: "workspace:ws-1" },
              sources: [
                { scopeId: "workspace:ws-1", resourceKey: "doc:denied" },
              ],
            },
          },
        ],
        receipt: { kind: "test" },
      }),
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "What do we remember?" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("ALLOWED_PART")
    expect(JSON.stringify(payload)).not.toContain("DENIED_PART_SHOULD_HIDE_ALL")
  })

  it("quarantines labelled recall when its target audience does not match the active scope", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () =>
        scopedRecall({
          audience: { kind: "scope", scopeId: "workspace:ws-2" },
          sources: [{ scopeId: "workspace:ws-2" }],
          content: "## Relevant memory\n- WRONG_AUDIENCE_RECALL",
        }),
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "What do we remember?" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("WRONG_AUDIENCE_RECALL")
  })

  it("does not ambiently inject personal recall into a shared workspace context", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () =>
        scopedRecall({
          audience: { kind: "personal", principalId: "user-1" },
          content: "## Relevant memory\n- PERSONAL_SHOULD_STAY_PRIVATE",
        }),
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "What do we remember?" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain(
      "PERSONAL_SHOULD_STAY_PRIVATE",
    )
  })

  it("allows legacy string recall only in the principal-private target", async () => {
    const personalChannel = testChannel({
      compiler: compilerWith([]),
      recallLatestTurn: () => "## Relevant memory\n- LEGACY_PRIVATE_RECALL",
    })
    const sharedChannel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "workspace:ws-1",
        },
      },
      compiler: compilerWith([]),
      recallLatestTurn: () => "## Relevant memory\n- LEGACY_PRIVATE_RECALL",
    })
    const personalSend = vi.fn(async () => session())
    const sharedSend = vi.fn(async () => session())

    await postSession(personalChannel, personalSend, {
      message: "What do we remember?",
    })
    await postSession(sharedChannel, sharedSend, {
      message: "What do we remember?",
    })

    expect(JSON.stringify(firstSendCall(personalSend)[0])).toContain(
      "LEGACY_PRIVATE_RECALL",
    )
    expect(JSON.stringify(firstSendCall(sharedSend)[0])).not.toContain(
      "LEGACY_PRIVATE_RECALL",
    )
  })

  it("omits recall when the host finds nothing authorized and relevant", async () => {
    const channel = testChannel({
      compiler: compilerWith([]),
      recallLatestTurn: () => undefined,
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "Unrelated question" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).not.toContain("Relevant memory")
  })

  it("omits recall when it would exceed the turn context budget", async () => {
    const channel = testChannel({
      compiler: compilerWith([]),
      identityFloor: () => "STABLE_IDENTITY_FLOOR",
      maxTokens: 20,
      recallLatestTurn: () => `RECALL_MARKER ${"x".repeat(200)}`,
    })
    const send = vi.fn(async () => session())

    await postSession(channel, send, { message: "hello" })

    const [payload] = firstSendCall(send)
    expect(JSON.stringify(payload)).toContain("STABLE_IDENTITY_FLOOR")
    expect(JSON.stringify(payload)).not.toContain("RECALL_MARKER")
  })

  it("injects the session blackboard into every turn (S3.2)", async () => {
    const channel = testChannel({
      auth: {
        ...SESSION_AUTH,
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "session:sess-1",
        },
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
        attributes: {
          sigilPersonaId: "agent-a",
          sigilResourceScope: "project:proj-1",
        },
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
})

function testChannel(options: {
  auth?: typeof SESSION_AUTH
  compiler: ContextCompiler
  identityFloor?: (input: {
    eveSessionId: string
    personaId: string
    principalId: string
  }) => string
  maxTokens?: number
  pinnedResourceKeys?: readonly string[]
  readBlackboard?: (sessionId: string) => Promise<string>
  recallLatestTurn?: SigilContextOptions["recallLatestTurn"]
}) {
  return eveChannel({
    auth: [() => options.auth ?? SESSION_AUTH],
    onMessage: createSigilEveOnMessage({
      compiler: options.compiler,
      identityFloor: options.identityFloor,
      maxTokens: options.maxTokens,
      pinnedResourceKeys: options.pinnedResourceKeys,
      readBlackboard: options.readBlackboard,
      recallLatestTurn: options.recallLatestTurn,
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

function compilerWith(
  contributors: Parameters<ContextContributorRegistry["register"]>[0][],
) {
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
    return {
      tokens: Math.max(1, Math.ceil(input.content.length / 4)),
      quality: "fallback" as const,
    }
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

function scopedRecall(input: {
  audience:
    | { kind: "personal"; principalId: string }
    | { kind: "scope"; scopeId: string }
  sources?: readonly { scopeId: string; resourceKey?: string }[]
  content: string
}) {
  return {
    content: input.content,
    selectedRecordIds: ["memory-1"],
    records: [
      {
        id: "memory-1",
        labels: {
          legacy: false,
          audience: input.audience,
          sources: input.sources ?? [],
        },
      },
    ],
    receipt: { kind: "test" },
  }
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
