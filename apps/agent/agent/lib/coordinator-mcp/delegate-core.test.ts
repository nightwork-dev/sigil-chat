import { describe, expect, it } from "vitest"

import {
  coordinatorPrincipalId,
  createCoordinatorAuthorityRegistry,
  type CoordinatorAuthorityGrant,
} from "@workspace/agent-contracts/coordinator-authority"

import {
  delegateToEve,
  EMPTY_REQUEST_SPOKEN,
  UNAUTHORIZED_SPOKEN,
  type DelegateCoreContext,
} from "./delegate-core"
import type { EveDelegatePort, EveDelegateResult } from "./eve-delegate-port"

const USER = "user-1"
const COORDINATOR = coordinatorPrincipalId(USER)
const SCOPE = "workspace:atlas"
const CAPABILITY = "eve-delegation"

/** The grant every test narrows or removes from. */
function activeGrant(): readonly CoordinatorAuthorityGrant[] {
  const registry = createCoordinatorAuthorityRegistry({
    now: () => new Date(1_700_000_000_000),
    createId: () => "grant-1",
  })
  registry.grant({
    actions: ["tool"],
    capability: CAPABILITY,
    grantedBy: USER,
    principalId: COORDINATOR,
    resourceScope: SCOPE,
  })
  return registry.listActive()
}

interface RecordingPort extends EveDelegatePort {
  readonly requests: string[]
}

function recordingPort(result: EveDelegateResult): RecordingPort {
  const requests: string[] = []
  return {
    requests,
    async submit(request) {
      requests.push(request)
      return result
    },
  }
}

function contextWith(
  grants: readonly CoordinatorAuthorityGrant[],
  port: EveDelegatePort,
): DelegateCoreContext {
  return {
    coordinatorPrincipalId: COORDINATOR,
    authorityResourceScope: SCOPE,
    capability: CAPABILITY,
    grants,
    port,
    createActionId: () => "action-1",
  }
}

describe("authority gates the delegation, both directions", () => {
  it("delegates under a matching grant and carries the grant id receipt", async () => {
    const port = recordingPort({ message: "Eve did it.", status: "completed" })
    const outcome = await delegateToEve(
      contextWith(activeGrant(), port),
      "publish the draft",
    )
    expect(outcome).toEqual({
      status: "delegated",
      spoken: "Eve did it.",
      grantId: "grant-1",
    })
    expect(port.requests).toEqual(["publish the draft"])
  })

  it("refuses without a grant and never reaches Eve", async () => {
    const port = recordingPort({ message: "should not run", status: "completed" })
    const outcome = await delegateToEve(contextWith([], port), "publish the draft")
    expect(outcome).toEqual({
      status: "refused",
      spoken: UNAUTHORIZED_SPOKEN,
      reason: "no-authority",
    })
    // Authority is checked BEFORE reach: the port is never touched.
    expect(port.requests).toEqual([])
  })

  it("refuses once the grant is revoked", async () => {
    const registry = createCoordinatorAuthorityRegistry({
      now: () => new Date(1_700_000_000_000),
      createId: () => "grant-1",
    })
    const grant = registry.grant({
      actions: ["tool"],
      capability: CAPABILITY,
      grantedBy: USER,
      principalId: COORDINATOR,
      resourceScope: SCOPE,
    })
    registry.revoke(grant.id, USER)
    const port = recordingPort({ message: "should not run", status: "completed" })
    const outcome = await delegateToEve(
      contextWith(registry.listActive(), port),
      "publish the draft",
    )
    expect(outcome.status).toBe("refused")
    expect(port.requests).toEqual([])
  })

  it("refuses a grant that names a different scope", async () => {
    const context = {
      ...contextWith(activeGrant(), recordingPort({ message: "x", status: "completed" })),
      authorityResourceScope: "workspace:other",
    }
    const outcome = await delegateToEve(context, "publish the draft")
    expect(outcome.status).toBe("refused")
  })
})

describe("only speakable text crosses back", () => {
  it("returns Eve's message and never its events or data", async () => {
    const SECRET = "tool-output-secret-42"
    // A hostile/rich result: the port contract already narrows to message +
    // status, but prove delegate-core never surfaces anything else even when
    // handed extra fields.
    const port = recordingPort({
      message: "Here is the summary.",
      status: "completed",
      events: [{ secret: SECRET }],
      data: { secret: SECRET },
    } as unknown as EveDelegateResult)
    const outcome = await delegateToEve(contextWith(activeGrant(), port), "summarize")
    expect(outcome).toEqual({
      status: "delegated",
      spoken: "Here is the summary.",
      grantId: "grant-1",
    })
    expect(JSON.stringify(outcome)).not.toContain(SECRET)
  })

  it("speaks a plain line when Eve produced nothing readable", async () => {
    const port = recordingPort({ message: undefined, status: "completed" })
    const outcome = await delegateToEve(contextWith(activeGrant(), port), "do it")
    expect(outcome.status).toBe("delegated")
    expect(outcome.spoken.length).toBeGreaterThan(0)
  })

  it("reports a failed Eve turn as failed, still under the receipt", async () => {
    const port = recordingPort({ message: undefined, status: "failed" })
    const outcome = await delegateToEve(contextWith(activeGrant(), port), "do it")
    expect(outcome.status).toBe("failed")
    expect("grantId" in outcome && outcome.grantId).toBe("grant-1")
  })

  it("speaks 'still working' rather than hang when Eve is slow", async () => {
    // A turn that never resolves within the bound: the coordinator must answer
    // the model, not leave the ~32s realtime socket to reset in silence.
    const port: EveDelegatePort = { submit: () => new Promise(() => {}) }
    const outcome = await delegateToEve(
      { ...contextWith(activeGrant(), port), submitTimeoutMs: 10 },
      "do the slow thing",
    )
    expect(outcome.status).toBe("working")
    expect("grantId" in outcome && outcome.grantId).toBe("grant-1")
  })
})

describe("request hygiene", () => {
  it("refuses an empty request before deciding authority", async () => {
    const port = recordingPort({ message: "x", status: "completed" })
    const outcome = await delegateToEve(contextWith(activeGrant(), port), "   ")
    expect(outcome).toEqual({
      status: "refused",
      spoken: EMPTY_REQUEST_SPOKEN,
      reason: "empty-request",
    })
    expect(port.requests).toEqual([])
  })
})
