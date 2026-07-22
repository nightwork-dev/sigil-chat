import { describe, expect, it } from "vitest"
import type { MemoryRecord } from "@gonk/memory"
import {
  memoryDraft,
  memoryLabelsForSession,
  memoryTurn,
  scopedMemoryLabelsFromRecord,
  sigilMemoryHost,
} from "./memory"

describe("Sigil memory turn identity", () => {
  it("binds missing or blank Eve session ids to a non-blank provisional identity", () => {
    for (const eveSessionId of [undefined, "", "   "]) {
      const identity = sigilMemoryHost.identityAtSessionStart(
        memoryTurn(eveSessionId, "user-1"),
      )

      expect(identity.binding.executionSessionId).toBe("new:user-1")
      expect(identity.binding.personaId).toBe("sigil-chat-eve")
      expect(identity.binding.channelId).toBe("sigil-chat")
    }
  })

  it("uses Eve's durable session id when it is present", () => {
    const identity = sigilMemoryHost.identityAtSessionStart(
      memoryTurn(" eve-session-1 ", " user-1 "),
    )

    expect(identity.binding.executionSessionId).toBe("eve-session-1")
  })
})

describe("Sigil scoped memory labels", () => {
  it("adds source provenance and audience labels to new memory drafts", () => {
    const draft = memoryDraft("agent-a", "user-1", "Remember this", {
      sources: [{ scopeId: "workspace:ws-1", resourceKey: "doc:launch" }],
      audience: { kind: "scope", scopeId: "workspace:ws-1" },
    })

    expect(draft.evidence).toContainEqual({
      kind: "record",
      id: "sigil-chat:source-resource:workspace:ws-1|doc:launch",
    })
    expect(draft.evidence).toContainEqual({
      kind: "record",
      id: "sigil-chat:audience-scope:workspace:ws-1",
    })
  })

  it("parses labelled records back into quarantine metadata", () => {
    const labels = scopedMemoryLabelsFromRecord(
      record({
        evidence: [
          { kind: "tool", id: "sigil-memory" },
          { kind: "record", id: "sigil-chat:source-scope:workspace:ws-1" },
          {
            kind: "record",
            id: "sigil-chat:source-resource:workspace:ws-1|doc:launch",
          },
          { kind: "record", id: "sigil-chat:audience-scope:workspace:ws-1" },
        ],
      }),
    )

    expect(labels).toEqual({
      sources: [{ scopeId: "workspace:ws-1", resourceKey: "doc:launch" }],
      audience: { kind: "scope", scopeId: "workspace:ws-1" },
    })
  })

  it("rejects unlabeled records instead of inferring a legacy audience", () => {
    const labels = scopedMemoryLabelsFromRecord(record({ evidence: [] }))

    expect(labels).toBeUndefined()
  })

  it("preserves multiple resource sources in the same scope", () => {
    const labels = scopedMemoryLabelsFromRecord(
      record({
        evidence: [
          {
            kind: "record",
            id: "sigil-chat:source-resource:ws-1|doc:first",
          },
          {
            kind: "record",
            id: "sigil-chat:source-resource:ws-1|doc:second",
          },
          { kind: "record", id: "sigil-chat:audience-scope:ws-1" },
        ],
      }),
    )

    expect(labels?.sources).toEqual([
      { scopeId: "ws-1", resourceKey: "doc:first" },
      { scopeId: "ws-1", resourceKey: "doc:second" },
    ])
  })

  it("keeps a personal agent's audience private across workspace perspectives", () => {
    expect(
      memoryLabelsForSession(
        sessionAttributes("personal-scope:user-1", "workspace:ws-2"),
        "user-1",
      ),
    ).toEqual({
      audience: { kind: "personal", principalId: "user-1" },
      sources: [{ scopeId: "ws-2" }],
    })
  })

  it("homes shared memory in the immutable workspace scope", () => {
    expect(memoryLabelsForSession(sessionAttributes("ws-1"), "user-1")).toEqual(
      {
        audience: { kind: "scope", scopeId: "ws-1" },
        sources: [{ scopeId: "ws-1" }],
      },
    )
  })

  it("requires an immutable session binding before writing memory", () => {
    expect(() => memoryLabelsForSession({}, "user-1")).toThrow(
      "immutable session binding",
    )
  })
})

function sessionAttributes(homeScopeId: string, resourceScope?: string) {
  return {
    sigilExecutionBinding: JSON.stringify({ homeScopeId }),
    ...(resourceScope ? { sigilResourceScope: resourceScope } : {}),
  }
}

function record(
  overrides: Partial<MemoryRecord["provenance"]> = {},
): MemoryRecord {
  return {
    id: "memory-1",
    owner: { personaId: "agent-a" },
    scope: { tier: "persona", id: "agent-a" },
    kind: "preference",
    subject: { kind: "principal", id: "user-1" },
    audience: {
      recall: {
        kind: "relationship",
        personaId: "agent-a",
        principalId: "user-1",
        requirePresent: true,
      },
      disclosure: { kind: "same-as-recall" },
    },
    content: "Remember this",
    provenance: {
      source: "tool",
      author: { kind: "principal", id: "user-1" },
      evidence: [],
      ...overrides,
    },
    lifecycle: {
      status: "accepted",
      supersedes: [],
    },
    createdAt: 1,
    updatedAt: 1,
  }
}
