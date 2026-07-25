import { describe, expect, it } from "vitest"

import {
  COORDINATOR_BOUNDS,
  createAgentCoordinator,
  delegationKey,
  type CoordinatorEvent,
  type CoordinatorSessionPort,
  type CoordinatorTurnResult,
  type Delegation,
  type DelegationProvenance,
} from "./agent-coordinator"

const SESSION = "session-a"

/** The provenance every delegation must carry. Tests that falsify provenance
 *  blank one field of THIS object at a time, so a field added to the contract
 *  is covered by adding it here rather than by remembering to write a test. */
const PROVENANCE: DelegationProvenance = {
  principalId: "user-1",
  personaId: "persona-1",
  resourceScope: "scope/thread-1",
  approvalMode: "ask",
  source: "typed",
}

function delegation(
  delegationId: string,
  overrides: Partial<Delegation> = {},
): Delegation {
  return {
    delegationId,
    sessionId: SESSION,
    text: `do ${delegationId}`,
    provenance: PROVENANCE,
    ...overrides,
  }
}

interface FakePort extends CoordinatorSessionPort {
  /** Every port call, in order, as `verb:subject`. */
  readonly calls: readonly string[]
  /** Whatever was passed as `turnId` on each cancel — including undefined,
   *  which is exactly the defect the steering rule exists to prevent. */
  readonly cancelTurnIds: readonly (string | undefined)[]
  readonly sent: readonly Delegation[]
  maxConcurrentTurns(): number
  setExternallyBusy(busy: boolean): void
  /** Settle the turn the port is currently running. */
  settleActive(result?: CoordinatorTurnResult): void
}

function createFakePort(
  options: { readonly autoSettle?: boolean; readonly failSend?: boolean } = {},
): FakePort {
  const calls: string[] = []
  const cancelTurnIds: Array<string | undefined> = []
  const sent: Delegation[] = []
  let externallyBusy = false
  let turnCounter = 0
  let concurrent = 0
  let maxConcurrent = 0
  let active:
    | { turnId: string; settle: (result: CoordinatorTurnResult) => void }
    | undefined

  function startTurn(
    verb: "send" | "deliver",
    input: Delegation,
  ): Promise<CoordinatorTurnResult> {
    calls.push(`${verb}:${input.delegationId}`)
    sent.push(input)
    turnCounter += 1
    concurrent += 1
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    if (options.failSend) {
      concurrent -= 1
      return Promise.reject(new Error(`port refused ${input.delegationId}`))
    }
    if (options.autoSettle) {
      concurrent -= 1
      return Promise.resolve({ status: "succeeded" })
    }
    const turnId = `turn-${turnCounter}`
    return new Promise<CoordinatorTurnResult>((resolve) => {
      active = {
        turnId,
        settle: (result) => {
          concurrent -= 1
          active = undefined
          resolve(result)
        },
      }
    })
  }

  return {
    calls,
    cancelTurnIds,
    sent,
    maxConcurrentTurns: () => maxConcurrent,
    setExternallyBusy(busy) {
      externallyBusy = busy
    },
    settleActive(result = { status: "succeeded" }) {
      active?.settle(result)
    },
    isBusy: () => externallyBusy || active !== undefined,
    activeTurnId: () => active?.turnId,
    send: (input) => startTurn("send", input),
    deliver: (input) => startTurn("deliver", input),
    cancel(cancelOptions) {
      cancelTurnIds.push(cancelOptions.turnId)
      calls.push(`cancel:${cancelOptions.turnId}`)
      active?.settle({ status: "cancelled" })
      return Promise.resolve()
    },
  }
}

/** Let queued microtasks (the coordinator's pump) run to completion. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function recorder() {
  const events: CoordinatorEvent[] = []
  return {
    events,
    onEvent: (event: CoordinatorEvent) => {
      events.push(event)
    },
  }
}

describe("delegationKey", () => {
  it("scopes idempotency to the session", () => {
    expect(delegationKey(delegation("d1"))).not.toBe(
      delegationKey(delegation("d1", { sessionId: "session-b" })),
    )
  })
})

describe("delegation provenance", () => {
  it("carries the full provenance into the bound session", async () => {
    const port = createFakePort({ autoSettle: true })
    const coordinator = createAgentCoordinator({ port })

    expect(coordinator.delegate(delegation("d1"))).toEqual({
      status: "started",
    })
    await coordinator.whenIdle()

    expect(port.sent).toHaveLength(1)
    expect(port.sent[0]?.provenance).toEqual(PROVENANCE)
  })

  it("refuses a delegation missing any provenance field", () => {
    for (const field of Object.keys(PROVENANCE) as Array<
      keyof DelegationProvenance
    >) {
      const port = createFakePort({ autoSettle: true })
      const coordinator = createAgentCoordinator({ port })
      const incomplete = delegation("d1", {
        provenance: { ...PROVENANCE, [field]: "" } as DelegationProvenance,
      })

      expect(coordinator.delegate(incomplete)).toEqual({
        status: "rejected",
        reason: "incomplete-provenance",
      })
      expect(port.calls).toEqual([])
    }
  })

  it("refuses an empty request rather than opening a turn about nothing", () => {
    const port = createFakePort({ autoSettle: true })
    const coordinator = createAgentCoordinator({ port })

    expect(coordinator.delegate(delegation("d1", { text: "  " }))).toEqual({
      status: "rejected",
      reason: "empty-text",
    })
    expect(port.calls).toEqual([])
  })
})

describe("idempotency", () => {
  it("produces no second turn for a replayed delegation", async () => {
    const port = createFakePort({ autoSettle: true })
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    await coordinator.whenIdle()
    const replay = coordinator.delegate(delegation("d1"))
    await flush()

    expect(replay).toEqual({ status: "duplicate" })
    expect(port.calls).toEqual(["send:d1"])
  })

  it("produces no second queue entry for a replay arriving while busy", () => {
    const port = createFakePort()
    port.setExternallyBusy(true)
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    const depthAfterFirst = coordinator.queueDepth()
    const replay = coordinator.delegate(delegation("d1"))

    expect(replay).toEqual({ status: "duplicate" })
    expect(coordinator.queueDepth()).toBe(depthAfterFirst)
  })

  it("treats the same delegation id in another session as distinct work", async () => {
    const port = createFakePort({ autoSettle: true })
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    coordinator.delegate(delegation("d1", { sessionId: "session-b" }))
    await coordinator.whenIdle()

    expect(port.calls).toEqual(["send:d1", "send:d1"])
    expect(port.sent.map((input) => input.sessionId)).toEqual([
      SESSION,
      "session-b",
    ])
  })

  it("does not resurrect a delegation that overflow already dropped", async () => {
    const port = createFakePort({ autoSettle: true })
    port.setExternallyBusy(true)
    const coordinator = createAgentCoordinator({ port })

    const overflow = COORDINATOR_BOUNDS.queueCapacity + 1
    for (let index = 0; index < overflow; index += 1) {
      coordinator.delegate(delegation(`d${index}`))
    }
    // d0 was dropped. Replaying it must stay a duplicate — at most one turn
    // per delegation, ever.
    expect(coordinator.delegate(delegation("d0"))).toEqual({
      status: "duplicate",
    })

    port.setExternallyBusy(false)
    coordinator.notifySessionIdle()
    await coordinator.whenIdle()

    expect(port.calls).not.toContain("send:d0")
  })
})

describe("queueing while the session is busy", () => {
  it("queues to the stated cap and drops the oldest on overflow", () => {
    const port = createFakePort()
    port.setExternallyBusy(true)
    const { events, onEvent } = recorder()
    const coordinator = createAgentCoordinator({ port, onEvent })

    const overflowBy = 2
    const total = COORDINATOR_BOUNDS.queueCapacity + overflowBy
    for (let index = 0; index < total; index += 1) {
      coordinator.delegate(delegation(`d${index}`))
    }

    expect(coordinator.queueDepth()).toBe(COORDINATOR_BOUNDS.queueCapacity)
    // The OLDEST go, not the newest: a request just made is the one the user
    // is still waiting on.
    expect(coordinator.dropped().map((entry) => entry.delegationId)).toEqual(
      Array.from({ length: overflowBy }, (_, index) => `d${index}`),
    )
    expect(
      events
        .filter((event) => event.type === "delegation-dropped")
        .map((event) => event.delegation.delegationId),
    ).toEqual(coordinator.dropped().map((entry) => entry.delegationId))
  })

  it("surfaces every drop rather than discarding it silently", () => {
    const port = createFakePort()
    port.setExternallyBusy(true)
    const { events, onEvent } = recorder()
    const coordinator = createAgentCoordinator({ port, onEvent })

    const total = COORDINATOR_BOUNDS.queueCapacity * 2
    for (let index = 0; index < total; index += 1) {
      coordinator.delegate(delegation(`d${index}`))
    }

    const heard = total
    const queued = coordinator.queueDepth()
    const surfacedDrops = events.filter(
      (event) => event.type === "delegation-dropped",
    ).length

    // Nothing the coordinator heard may vanish unaccounted for.
    expect(queued + surfacedDrops).toBe(heard)
    expect(coordinator.dropped()).toHaveLength(surfacedDrops)
  })

  it("drains the queue in order once the session frees up", async () => {
    const port = createFakePort({ autoSettle: true })
    port.setExternallyBusy(true)
    const coordinator = createAgentCoordinator({ port })

    const ids = Array.from(
      { length: COORDINATOR_BOUNDS.queueCapacity },
      (_, index) => `d${index}`,
    )
    for (const id of ids) coordinator.delegate(delegation(id))

    port.setExternallyBusy(false)
    coordinator.notifySessionIdle()
    await coordinator.whenIdle()

    expect(port.calls).toEqual(ids.map((id) => `send:${id}`))
  })

  it("keeps draining after a turn fails", async () => {
    const port = createFakePort({ autoSettle: true, failSend: true })
    const { events, onEvent } = recorder()
    const coordinator = createAgentCoordinator({ port, onEvent })

    coordinator.delegate(delegation("d1"))
    coordinator.delegate(delegation("d2"))
    await coordinator.whenIdle()

    expect(port.calls).toEqual(["send:d1", "send:d2"])
    expect(
      events
        .filter((event) => event.type === "turn-settled")
        .map((event) => event.result.status),
    ).toEqual(["failed", "failed"])
  })
})

describe("steering", () => {
  it("cancels the observed turn and only then delivers the replacement", async () => {
    const port = createFakePort()
    const { events, onEvent } = recorder()
    const coordinator = createAgentCoordinator({ port, onEvent })

    coordinator.delegate(delegation("d1"))
    const observedTurnId = port.activeTurnId()
    expect(observedTurnId).toBeDefined()

    const steering = coordinator.steer(delegation("d2"))
    await flush()
    port.settleActive()
    const outcome = await steering

    expect(outcome).toEqual({
      status: "steered",
      cancelledTurnId: observedTurnId,
    })
    expect(port.calls).toEqual([
      "send:d1",
      `cancel:${observedTurnId}`,
      "deliver:d2",
    ])
    expect(
      events.some(
        (event) =>
          event.type === "steered" && event.cancelledTurnId === observedTurnId,
      ),
    ).toBe(true)
  })

  it("always passes a turnId to cancel", async () => {
    const port = createFakePort()
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    const first = coordinator.steer(delegation("d2"))
    await flush()
    port.settleActive()
    await first

    const second = coordinator.steer(delegation("d3"))
    await flush()
    port.settleActive()
    await second

    expect(port.cancelTurnIds.length).toBeGreaterThan(0)
    for (const turnId of port.cancelTurnIds) {
      expect(turnId).toBeTruthy()
    }
  })

  it("never runs two turns concurrently", async () => {
    const port = createFakePort()
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    coordinator.delegate(delegation("d2"))
    const steering = coordinator.steer(delegation("d3"))
    await flush()
    port.settleActive()
    await steering
    port.settleActive()
    await flush()

    expect(port.maxConcurrentTurns()).toBe(1)
  })

  it("delegates normally when no turn has been observed", async () => {
    const port = createFakePort({ autoSettle: true })
    const coordinator = createAgentCoordinator({ port })

    const outcome = await coordinator.steer(delegation("d1"))

    expect(outcome).toEqual({
      status: "delegated",
      admission: { status: "started" },
    })
    // Cancelling blind could stop a turn the coordinator never saw.
    expect(port.cancelTurnIds).toEqual([])
  })

  it("refuses a replayed steer instead of cancelling a second time", async () => {
    const port = createFakePort()
    const coordinator = createAgentCoordinator({ port })

    coordinator.delegate(delegation("d1"))
    const first = coordinator.steer(delegation("d2"))
    await flush()
    port.settleActive()
    await first

    const replay = await coordinator.steer(delegation("d2"))

    expect(replay).toEqual({ status: "duplicate" })
    expect(port.cancelTurnIds).toHaveLength(1)
  })
})
