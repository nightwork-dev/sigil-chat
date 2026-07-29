import { describe, expect, it } from "vitest"

import type {
  AgentChannelPersonaSessionParticipant,
  AgentSessionChannel,
} from "@workspace/agent-contracts/participant-channel"
import type {
  AgentSendInput,
  AgentTurnResult,
} from "@zigil/agent-surface/contracts"

import {
  createParticipantChannelRuntime,
  createSingleSessionChannel,
  type ParticipantChannelSessionPort,
} from "./agent-participant-channel-runtime"

describe("participant channel runtime", () => {
  it("dispatches two persona participants with channel provenance and keeps non-targets dormant", async () => {
    const { channel, ports } = multiParticipantFixture()
    const runtime = createParticipantChannelRuntime({
      channel,
      sessions: ports,
      now: sequenceClock(),
    })

    await runtime.dispatch({
      coordinatorParticipantId: "owner",
      targetParticipantId: "persona-a",
      message: "Answer as A",
      input: { clientContext: "visible room context" },
      bounds: { requestedAt: 1, maxOutputTokens: 128 },
    })
    await runtime.dispatch({
      coordinatorParticipantId: "owner",
      targetParticipantId: "persona-b",
      message: "Answer as B",
      bounds: { requestedAt: 2 },
    })

    expect(ports.get("eve-a")?.sent.map((input) => input.message)).toEqual([
      "Answer as A",
    ])
    expect(ports.get("eve-b")?.sent.map((input) => input.message)).toEqual([
      "Answer as B",
    ])
    expect(runtime.sentCount("persona-c")).toBe(0)
    expect(runtime.participantState("persona-a")).toBe("active")
    expect(runtime.participantState("persona-b")).toBe("active")
    expect(runtime.participantState("persona-c")).toBe("dormant")

    const receipts = runtime.events.filter(
      (event) => event.type === "participant.dispatch",
    )
    expect(receipts).toHaveLength(2)
    expect(receipts[0]?.receipt).toMatchObject({
      coordinator: {
        channelId: "channel-1",
        participantId: "owner",
        principalId: "user-1",
        kind: "human",
        role: "owner",
      },
      target: {
        channelId: "channel-1",
        participantId: "persona-a",
        personaId: "agent-a",
        eveSessionId: "eve-a",
        applicationThreadId: "thread-a",
        state: "active",
      },
      intended: {
        channelId: "channel-1",
        targetParticipantId: "persona-a",
        targetEveSessionId: "eve-a",
        targetApplicationThreadId: "thread-a",
      },
    })

    const envelopes = runtime.events.filter(
      (event) => event.type === "participant.envelope",
    )
    expect(envelopes.map((event) => event.envelope.subject)).toContain(
      "context-contribution",
    )
    expect(envelopes[0]?.envelope.provenance).toMatchObject({
      channelId: "channel-1",
      participantId: "persona-a",
      personaId: "agent-a",
      eveSessionId: "eve-a",
      applicationThreadId: "thread-a",
    })
  })

  it("captures the target active turn, waits for target settlement, and never cancels another participant", async () => {
    const { channel, ports } = multiParticipantFixture({
      autoSettle: false,
    })
    const runtime = createParticipantChannelRuntime({
      channel,
      sessions: ports,
      now: sequenceClock(),
    })
    const portA = requirePort(ports, "eve-a")
    const portB = requirePort(ports, "eve-b")

    const firstA = runtime.dispatch({
      coordinatorParticipantId: "owner",
      targetParticipantId: "persona-a",
      message: "First A",
    })
    const firstB = runtime.dispatch({
      coordinatorParticipantId: "owner",
      targetParticipantId: "persona-b",
      message: "First B",
    })
    await flush()

    const observedA = portA.activeTurnId
    expect(observedA).toBeTruthy()
    expect(portB.activeTurnId).toBeTruthy()

    const replacement = runtime.interrupt({
      coordinatorParticipantId: "owner",
      targetParticipantId: "persona-a",
      message: "Replacement A",
      reason: "player redirected the addressed participant",
    })
    await flush()

    expect(portA.cancelTurnIds).toEqual([observedA])
    expect(portB.cancelTurnIds).toEqual([])
    expect(portA.sent.map((input) => input.message)).toEqual(["First A"])

    portB.settleActive({ status: "succeeded" })
    await firstB
    await flush()
    expect(portA.sent.map((input) => input.message)).toEqual(["First A"])

    portA.settleActive({ status: "cancelled" })
    await flush()
    expect(portA.sent.map((input) => input.message)).toEqual([
      "First A",
      "Replacement A",
    ])

    portA.settleActive({ status: "succeeded" })
    await Promise.all([firstA, replacement])

    expect(
      runtime.events.some(
        (event) =>
          event.type === "participant.interrupt" &&
          event.observedTurnId === observedA &&
          event.request.target.participantId === "persona-a",
      ),
    ).toBe(true)
  })

  it("preserves single-session behavior as the degenerate participant channel", async () => {
    const channel = createSingleSessionChannel({
      channelId: "single-channel",
      principalId: "user-1",
      personaId: "agent-a",
      eveSessionId: "eve-a",
      applicationThreadId: "thread-a",
    })
    const port = createFakePort("eve-a")
    const runtime = createParticipantChannelRuntime({
      channel,
      sessions: new Map([[port.sessionId, port]]),
      now: sequenceClock(),
    })

    const result = await runtime.dispatch({
      coordinatorParticipantId: "user-1:owner",
      targetParticipantId: "agent-a:session",
      message: "ordinary chat send",
    })

    expect(result.result).toEqual({ status: "succeeded" })
    expect(port.sent).toEqual([{ message: "ordinary chat send" }])
    expect(runtime.sentCount("agent-a:session")).toBe(1)
    expect(result.receipt.target).toMatchObject({
      channelId: "single-channel",
      participantId: "agent-a:session",
      personaId: "agent-a",
      eveSessionId: "eve-a",
      applicationThreadId: "thread-a",
      state: "active",
    })
  })
})

interface FakePort extends ParticipantChannelSessionPort {
  readonly sent: readonly AgentSendInput[]
  readonly cancelTurnIds: readonly (string | undefined)[]
  settleActive(result: AgentTurnResult): void
}

function multiParticipantFixture(
  options: { readonly autoSettle?: boolean } = {},
) {
  const participants: AgentSessionChannel["participants"] = [
    {
      kind: "human",
      participantId: "owner",
      principalId: "user-1",
      role: "owner",
    },
    participant("persona-a", "agent-a", "eve-a", "thread-a"),
    participant("persona-b", "agent-b", "eve-b", "thread-b"),
    participant("persona-c", "agent-c", "eve-c", "thread-c"),
  ]
  const ports = new Map<string, FakePort>(
    ["eve-a", "eve-b", "eve-c"].map((sessionId) => [
      sessionId,
      createFakePort(sessionId, options),
    ]),
  )
  return {
    channel: {
      channelId: "channel-1",
      ownerPrincipalId: "user-1",
      participants,
    },
    ports,
  }
}

function participant(
  participantId: string,
  personaId: string,
  eveSessionId: string,
  applicationThreadId: string,
): AgentChannelPersonaSessionParticipant {
  return {
    kind: "persona-session",
    participantId,
    principalId: "user-1",
    personaId,
    eveSessionId,
    applicationThreadId,
    role: "participant",
    state: "dormant",
  }
}

function createFakePort(
  sessionId: string,
  options: { readonly autoSettle?: boolean } = {},
): FakePort {
  const sent: AgentSendInput[] = []
  const cancelTurnIds: Array<string | undefined> = []
  let turn = 0
  let active:
    | {
        readonly turnId: string
        readonly settle: (result: AgentTurnResult) => void
      }
    | undefined

  return {
    sessionId,
    sent,
    cancelTurnIds,
    get activeTurnId() {
      return active?.turnId
    },
    send(input) {
      sent.push(input)
      turn += 1
      if (options.autoSettle !== false) {
        return Promise.resolve({ status: "succeeded" })
      }
      return new Promise<AgentTurnResult>((resolve) => {
        active = {
          turnId: `${sessionId}-turn-${turn}`,
          settle: (result) => {
            active = undefined
            resolve(result)
          },
        }
      })
    },
    cancel(cancelOptions) {
      cancelTurnIds.push(cancelOptions?.turnId)
      return Promise.resolve({ outcome: "accepted" })
    },
    settleActive(result) {
      active?.settle(result)
    },
  }
}

function requirePort(
  ports: ReadonlyMap<string, FakePort>,
  sessionId: string,
): FakePort {
  const port = ports.get(sessionId)
  if (!port) throw new Error(`Missing port ${sessionId}`)
  return port
}

function sequenceClock(): () => number {
  let tick = 0
  return () => ++tick
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
