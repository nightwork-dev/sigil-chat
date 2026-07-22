import { describe, expect, it } from "vitest"
import { InMemoryMemoryRecordStore, type MemoryRecord } from "@gonk/memory"
import { EveMemoryHost } from "@gonk/eve-host/guard"
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

describe("Sigil memory host verification fixtures", () => {
  it("suppresses automatic recall for empty and nonmatching latest-turn queries", () => {
    const { host, turn } = memoryFixture()

    const write = host.remember(
      turn("session-1", "user-1"),
      memoryDraft("sigil-chat-eve", "user-1", "Launch briefs prefer auburn."),
    )

    const emptyDelivery = host.automaticRecallForTurn(
      turn("session-1", "user-1"),
      "and the or to",
    )

    expect(write.to).toBe("accepted")
    expect(emptyDelivery.message).toBeUndefined()
    expect(emptyDelivery.selectedRecordIds).toEqual([])
    expect(emptyDelivery.receipt.query.normalized).toBe("")
    expect(emptyDelivery.receipt.recordIdsConsidered).toEqual([])

    const nonmatchingDelivery = host.automaticRecallForTurn(
      turn("session-1", "user-1"),
      "tax filings",
    )

    expect(nonmatchingDelivery.message).toBeUndefined()
    expect(nonmatchingDelivery.selectedRecordIds).toEqual([])
    expect(nonmatchingDelivery.receipt.query.normalized).toBe("tax filings")
    expect(nonmatchingDelivery.receipt.recordIdsConsidered).toEqual([])
  })

  it("recalls accepted relationship memory for the same principal in a later session", () => {
    const { host, turn } = memoryFixture()

    host.remember(
      turn("session-1", "user-1"),
      memoryDraft(
        "sigil-chat-eve",
        "user-1",
        "User one calls the shared release room ember.",
      ),
    )

    const laterSessionDelivery = host.automaticRecallForTurn(
      turn("session-2", "user-1"),
      "shared release room ember",
    )

    expect(laterSessionDelivery.selectedRecordIds).toEqual(["memory-1"])
    expect(laterSessionDelivery.message?.content).toContain(
      "release room ember",
    )
  })

  it("keeps relationship memory isolated across principals at the Eve host boundary", () => {
    const { host, turn } = memoryFixture()

    const write = host.remember(
      turn("session-1", "user-1"),
      memoryDraft(
        "sigil-chat-eve",
        "user-1",
        "User one uses the vermilion launch keyword.",
      ),
    )

    const otherPrincipalDelivery = host.automaticRecallForTurn(
      turn("session-2", "user-2"),
      "vermilion launch",
    )

    expect(write.to).toBe("accepted")
    expect(otherPrincipalDelivery.message).toBeUndefined()
    expect(otherPrincipalDelivery.selectedRecordIds).toEqual([])
    expect(otherPrincipalDelivery.receipt.sourceReceipt.recordIdsConsidered).toEqual(
      [],
    )
  })

  it("keeps the identity prompt prefix stable while recall is delivered only as latest-turn context", () => {
    const { host, turn } = memoryFixture()
    const trustedTurn = turn("session-1", "user-1")
    const before = host.identityAtSessionStart(trustedTurn)

    host.remember(
      trustedTurn,
      memoryDraft(
        "sigil-chat-eve",
        "user-1",
        "For reagent briefs, user one prefers lapis margin notes.",
      ),
    )

    const delivery = host.automaticRecallForTurn(
      trustedTurn,
      "lapis reagent margin notes",
    )
    const after = host.identityAtSessionStart(trustedTurn)
    const repeated = host.automaticRecallForTurn(
      trustedTurn,
      "lapis reagent margin notes",
    )

    expect(delivery.message?.customType).toBe("gonk-memory-recall")
    expect(delivery.message?.display).toBe(false)
    expect(delivery.message?.content).toContain("lapis margin notes")
    expect(after.markdown).toBe(before.markdown)
    expect(repeated.message).toBeUndefined()
    expect(repeated.receipt.omitted).toContainEqual({
      recordId: delivery.selectedRecordIds[0],
      reason: "already-delivered",
    })
  })

  it("preserves attributable episode provenance when the app supplies episode evidence", () => {
    const { host, store, turn } = memoryFixture()

    const write = host.remember(turn("session-1", "user-1"), {
      ...memoryDraft(
        "sigil-chat-eve",
        "user-1",
        "Retain the cited episode provenance.",
      ),
      evidence: [
        { kind: "tool", id: "sigil-memory" },
        { kind: "episode", id: "eve-session-1:turn-7" },
      ],
    })
    const record = store.get(write.recordId)

    expect(record?.provenance.author).toEqual({
      kind: "principal",
      id: "user-1",
    })
    expect(record?.provenance.evidence).toContainEqual({
      kind: "episode",
      id: "eve-session-1:turn-7",
    })
  })

  it("proves the disabled-memory A/B hermetically by omitting host recall", () => {
    const { host, turn } = memoryFixture()
    const trustedTurn = turn("session-1", "user-1")
    const prefix = host.identityAtSessionStart(trustedTurn).markdown

    host.remember(
      trustedTurn,
      memoryDraft(
        "sigil-chat-eve",
        "user-1",
        "Enabled memory recalls the cobalt planning token.",
      ),
    )

    const disabledMessages = [prefix, "Do we have the cobalt planning token?"]
    const enabledDelivery = host.automaticRecallForTurn(
      trustedTurn,
      "Do we have the cobalt planning token?",
    )

    expect(disabledMessages.join("\n")).not.toContain(
      "[memory] Relevant accepted memories",
    )
    expect(enabledDelivery.message?.content).toContain(
      "cobalt planning token",
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

function memoryFixture() {
  const store = new InMemoryMemoryRecordStore()
  const host = new EveMemoryHost({
    store,
    persona: {
      record: {
        id: "sigil-chat-eve",
        name: "Eve",
        description: "Fixture agent.",
        systemPrompt: "Fixture system prompt.",
      },
      authoredBaseId: "sigil-chat-eve-v1",
      identityFloor: {
        revision: "fixture-v1",
        selectedRecordIds: [],
        caps: {
          maxRecords: 3,
          maxContentCharsPerRecord: 300,
          maxTotalContentChars: 600,
        },
        stableSummaryTokenBudget: 80,
        selectedSelfRecordCap: 3,
        dynamicTokenBudget: 240,
        authoredBase: "Fixture system prompt.",
        stableSummary: "Fixture agent.",
      },
    },
    policy: {
      revision: "fixture-v1",
      createId: (() => {
        let next = 0
        return () => `memory-${++next}`
      })(),
      now: (() => {
        let next = 1000
        return () => next++
      })(),
    },
  })

  return {
    store,
    host,
    turn: (eveSessionId: string, principalId: string) =>
      memoryTurn(eveSessionId, principalId),
  }
}
