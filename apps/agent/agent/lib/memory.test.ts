import { describe, expect, it } from "vitest"
import type { MemoryRecord } from "@gonk/memory"
import {
  memoryDraft,
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
      id: "sigil-chat:source-scope:workspace:ws-1",
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
      legacy: false,
      sources: [{ scopeId: "workspace:ws-1", resourceKey: "doc:launch" }],
      audience: { kind: "scope", scopeId: "workspace:ws-1" },
    })
  })

  it("treats unlabeled relationship records as legacy personal-only memory", () => {
    const labels = scopedMemoryLabelsFromRecord(record({ evidence: [] }))

    expect(labels).toEqual({
      legacy: true,
      sources: [],
      audience: { kind: "personal", principalId: "user-1" },
    })
  })
})

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
