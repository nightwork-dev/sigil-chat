import { describe, expect, it } from "vitest"

import {
  buildCapabilityManifest,
  principalCanMutateScope,
  renderCapabilityManifestForAgent,
  type BuildCapabilityManifestInput,
} from "./capability-manifest"

function input(
  overrides: Partial<BuildCapabilityManifestInput> = {},
): BuildCapabilityManifestInput {
  return {
    host: { id: "eve", label: "Eve", model: "gpt-x" },
    identity: {
      principalId: "user-1",
      personaId: "sigil-chat-eve",
      applicationThreadId: "thread-1",
    },
    activeScope: "session:thread-1",
    readableContextScopes: ["project:atlas"],
    tools: [
      { name: "sigil-review-add-annotation", description: "Attach feedback" },
      { name: "sigil-ui-highlight", description: "Point at UI targets" },
    ],
    mutationsAllowed: true,
    continuity: {
      conversationPersists: true,
      durableMemory: true,
      sharedBlackboard: true,
    },
    issuedAt: 1_700_000_000,
    ...overrides,
  }
}

describe("buildCapabilityManifest", () => {
  it("normalizes tools: dedupes, labels, and sorts by label", () => {
    const manifest = buildCapabilityManifest(
      input({
        tools: [
          { name: "sigil-ui-highlight", description: "Point at UI targets" },
          { name: "sigil-review-add-annotation", description: "Attach feedback" },
          { name: "sigil-ui-highlight", description: "duplicate" },
          { name: "  ", description: "blank dropped" },
        ],
      }),
    )
    expect(manifest.actions.tools.map((tool) => tool.name)).toEqual([
      "sigil-review-add-annotation",
      "sigil-ui-highlight",
    ])
    expect(manifest.actions.tools[0]!.label).toBe("Review Add Annotation")
  })

  it("excludes the active scope from readable context scopes and dedupes", () => {
    const manifest = buildCapabilityManifest(
      input({
        activeScope: "session:thread-1",
        readableContextScopes: [
          "session:thread-1",
          "project:atlas",
          "project:atlas",
          "workspace:studio",
        ],
      }),
    )
    expect(manifest.visibility.readableContextScopes).toEqual([
      "project:atlas",
      "workspace:studio",
    ])
  })

  it("defaults modality to a separate, non-sharing experimental live voice", () => {
    const manifest = buildCapabilityManifest(input({ modality: undefined }))
    expect(manifest.modality).toEqual({
      liveVoiceSharesTextChatState: false,
      liveVoiceExperimental: true,
    })
  })

  it("marks attention as advisory and privacy as user-controlled", () => {
    const manifest = buildCapabilityManifest(input())
    expect(manifest.attention).toEqual({
      delivery: "advisory",
      privacyControlledBy: "user",
    })
  })
})

describe("renderCapabilityManifestForAgent — behavioral A/B", () => {
  const question = "sigil-review-add-annotation"

  it("changes the capability answer when a tool is present vs absent", () => {
    const withTool = renderCapabilityManifestForAgent(
      buildCapabilityManifest(
        input({
          tools: [{ name: question, description: "Attach feedback" }],
        }),
      ),
    )
    const withoutTool = renderCapabilityManifestForAgent(
      buildCapabilityManifest(
        input({
          tools: [{ name: "sigil-ui-highlight", description: "Point at UI" }],
        }),
      ),
    )

    // The load-bearing difference: the tool the agent would answer "yes" about
    // is present in one render and absent in the other.
    expect(withTool).toContain(question)
    expect(withoutTool).not.toContain(question)

    // Both renders carry the governing instruction that the manifest — not
    // ambient text — is the only authority for capability claims.
    for (const render of [withTool, withoutTool]) {
      expect(render).toContain("Do not claim a capability, tool, or scope")
    }
  })

  it("states a read-only scope refuses mutating tools", () => {
    const render = renderCapabilityManifestForAgent(
      buildCapabilityManifest(input({ mutationsAllowed: false })),
    )
    expect(render).toContain("read-only")
  })

  it("discloses that live voice does not share text-chat state", () => {
    const render = renderCapabilityManifestForAgent(
      buildCapabilityManifest(input()),
    )
    expect(render).toContain("does NOT share")
  })
})

describe("principalCanMutateScope", () => {
  const personalScopeId = (principalId: string) =>
    `personal-scope:${principalId}`

  it("allows a principal to mutate their own personal scope", () => {
    expect(
      principalCanMutateScope({
        principalId: "user-1",
        scopeId: "personal-scope:user-1",
        registries: {
          scopes: { get: () => ({ kind: "personal", id: "personal-scope:user-1" }) },
          personalScopes: { get: () => ({ principalId: "user-1" }) },
        },
        policy: { authorize: () => false },
        personalScopeId,
      }),
    ).toBe(true)
  })

  it("refuses another principal's personal scope even if the record exists", () => {
    expect(
      principalCanMutateScope({
        principalId: "user-2",
        scopeId: "personal-scope:user-1",
        registries: {
          scopes: { get: () => ({ kind: "personal", id: "personal-scope:user-1" }) },
          personalScopes: { get: () => ({ principalId: "user-1" }) },
        },
        policy: { authorize: () => true },
        personalScopeId,
      }),
    ).toBe(false)
  })

  it("defers a workspace scope to the grant policy", () => {
    const base = {
      principalId: "user-1",
      scopeId: "studio",
      registries: {
        scopes: { get: () => ({ kind: "workspace", id: "studio" }) },
        personalScopes: { get: () => undefined },
      },
      personalScopeId,
    }
    expect(
      principalCanMutateScope({ ...base, policy: { authorize: () => true } }),
    ).toBe(true)
    expect(
      principalCanMutateScope({ ...base, policy: { authorize: () => false } }),
    ).toBe(false)
  })

  it("treats an unknown or non-container scope as read-only", () => {
    expect(
      principalCanMutateScope({
        principalId: "user-1",
        scopeId: "installation:default",
        registries: {
          scopes: { get: () => ({ kind: "installation", id: "default" }) },
          personalScopes: { get: () => undefined },
        },
        policy: { authorize: () => true },
        personalScopeId,
      }),
    ).toBe(false)
  })
})
