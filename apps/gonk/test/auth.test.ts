import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"
import { describe, expect, it } from "vitest"

import { authenticateScopeDelegation } from "../src/auth.js"

const SECRET = "test-scope-delegation-secret"

describe("Gonk scope-delegation authentication", () => {
  it("projects Eve's signed end-user principal only while live policy allows it", async () => {
    let authorized = true
    const proof = issueScopeDelegation(
      {
        expiresAt: 200,
        scope: "workspace:holiday-launch",
        subject: "user-grantee",
      },
      SECRET,
    )
    const input = {
      now: 100,
      policy: { authorize: () => authorized },
      proof,
      scope: { tier: "workspace" as const, id: "holiday-launch" },
      secret: SECRET,
    }

    await expect(authenticateScopeDelegation(input)).resolves.toEqual({
      principalId: "user-grantee",
      scope: { tier: "workspace", id: "holiday-launch" },
    })

    // This is deliberately the same still-unexpired proof: revocation is a
    // policy read, not a cache expiry event.
    authorized = false
    await expect(authenticateScopeDelegation(input)).resolves.toBeUndefined()
  })

  it("rejects a proof when the supplied scope differs from its signed target", async () => {
    const proof = issueScopeDelegation(
      { expiresAt: 200, scope: "project:brand", subject: "user-a" },
      SECRET,
    )

    await expect(
      authenticateScopeDelegation({
        now: 100,
        policy: { authorize: () => true },
        proof,
        scope: { tier: "project", id: "commerce" },
        secret: SECRET,
      }),
    ).resolves.toBeUndefined()
  })
})
