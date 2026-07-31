import { describe, expect, it } from "vitest"

import type {
  AgentChannelPersonaSessionParticipant,
  AgentSessionChannel,
} from "@workspace/agent-contracts/participant-channel"
import type {
  AgentSendInput,
  AgentTurnResult,
} from "@zigil/agent/contracts"

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

    expect(ports.get("persona-a")?.sent.map((input) => input.message)).toEqual([
      "Answer as A",
    ])
    expect(ports.get("persona-b")?.sent.map((input) => input.message)).toEqual([
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
        runtimeSessionId: "eve-a",
        applicationThreadId: "thread-a",
        state: "active",
      },
      intended: {
        channelId: "channel-1",
        targetParticipantId: "persona-a",
        targetRuntimeSessionId: "eve-a",
        targetApplicationThreadId: "thread-a",
      },
    })

    expect(
      runtime.events.filter((event) => event.type === "participant.envelope"),
    ).toHaveLength(0)
  })

  it("records participant-produced envelopes explicitly", () => {
    const { channel, ports } = multiParticipantFixture()
    const runtime = createParticipantChannelRuntime({
      channel,
      sessions: ports,
      now: sequenceClock(),
    })

    const envelope = runtime.record({
      participantId: "persona-a",
      payload: { id: "tool-call-a" },
      subject: "tool-call",
      turnId: "turn-a",
    })

    expect(envelope).toMatchObject({
      kind: "agent.participant.provenance-envelope",
      payload: { id: "tool-call-a" },
      provenance: {
        applicationThreadId: "thread-a",
        runtimeSessionId: "eve-a",
        participantId: "persona-a",
        personaId: "agent-a",
      },
      subject: "tool-call",
      turnId: "turn-a",
    })
    expect(runtime.events).toEqual([
      { type: "participant.envelope", envelope },
    ])
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
    const portA = requirePort(ports, "persona-a")
    const portB = requirePort(ports, "persona-b")

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
      reason: "coordinator redirected the addressed participant",
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
      runtimeSessionId: "eve-a",
      applicationThreadId: "thread-a",
    })
    const port = createFakePort("agent-a:session", "eve-a")
    const runtime = createParticipantChannelRuntime({
      channel,
      sessions: new Map([[port.participantId, port]]),
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
      runtimeSessionId: "eve-a",
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
    [
      ["persona-a", "eve-a"],
      ["persona-b", "eve-b"],
      ["persona-c", "eve-c"],
    ].map(([participantId, sessionId]) => [
      participantId,
      createFakePort(participantId, sessionId, options),
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
  runtimeSessionId: string,
  applicationThreadId: string,
): AgentChannelPersonaSessionParticipant {
  return {
    kind: "persona-session",
    participantId,
    principalId: "user-1",
    personaId,
    runtimeSessionId,
    applicationThreadId,
    role: "participant",
    state: "dormant",
  }
}

function createFakePort(
  participantId: string,
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
    participantId,
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
  participantId: string,
): FakePort {
  const port = ports.get(participantId)
  if (!port) throw new Error(`Missing port ${participantId}`)
  return port
}

function sequenceClock(): () => number {
  let tick = 0
  return () => ++tick
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
