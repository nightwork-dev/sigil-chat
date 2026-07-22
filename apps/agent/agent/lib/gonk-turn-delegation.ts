import { createSignedDelegationProvider } from "@gonk/eve-host/guard"
import {
  SIGIL_GONK_DELEGATION_AUDIENCE,
  SIGIL_GONK_DELEGATION_ISSUER,
  SIGIL_GONK_DELEGATION_TTL_MS,
} from "@workspace/agent-contracts/gonk-turn-delegation"
import type { SessionContext } from "eve/context"

import {
  executionBindingFromCaller,
  principalSubject,
} from "./eve-auth"

const issuerAuthorization = () => ({
  outcome: "deny" as const,
  reason: "The Eve issuer does not authorize Gonk operations locally.",
})

export function createGonkTurnAuthProvider(
  context: SessionContext,
  secretValue: string | undefined,
  now: () => number = Date.now,
) {
  return {
    principalType: "user" as const,
    getToken: async ({ principal }: { principal: { type: string; id?: string } }) => {
      const caller = context.session.auth.current
      if (!caller || caller.principalType !== "user") {
        throw new Error("Gonk delegation requires an authenticated Eve user.")
      }
      const subject = principalSubject(caller)
      if (principal.type !== "user" || principal.id !== subject) {
        throw new Error("Gonk delegation principal does not match Eve auth.")
      }
      const executionBinding = executionBindingFromCaller(caller)
      if (!executionBinding) {
        throw new Error("Gonk delegation requires an execution binding.")
      }
      const secret = secretValue?.trim()
      if (!secret) throw new Error("Gonk delegation is unavailable.")
      const issuedAt = now()
      const activeResourceScope = stringAttribute(
        caller.attributes.sigilResourceScope ??
          caller.attributes.sigilSessionScope,
      )
      const provider = createSignedDelegationProvider({
        issuer: SIGIL_GONK_DELEGATION_ISSUER,
        audience: SIGIL_GONK_DELEGATION_AUDIENCE,
        secret,
        authorize: issuerAuthorization,
        maxTtlMs: SIGIL_GONK_DELEGATION_TTL_MS,
      })
      const claims = {
        issuer: SIGIL_GONK_DELEGATION_ISSUER,
        audience: SIGIL_GONK_DELEGATION_AUDIENCE,
        issuedAt,
        expiresAt: issuedAt + SIGIL_GONK_DELEGATION_TTL_MS,
        subject,
        channelId: executionBinding.applicationThreadId,
        personaId: executionBinding.personaId,
        eveSessionId: context.session.id,
        correlationId: context.session.turn.id,
        delegationId: `${context.session.id}:${context.session.turn.id}`,
        ...(activeResourceScope ? { activeResourceScope } : {}),
      }
      return {
        token: provider.issue(claims, issuedAt),
        expiresAt: claims.expiresAt,
      }
    },
  }
}

function stringAttribute(value: string | readonly string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
