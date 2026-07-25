// The one seam through which `delegate_to_eve` reaches the real Eve agent.
//
// The coordinator does NOT invent a second way to submit a turn. It uses the
// SAME Eve HTTP session route text chat uses (POST /eve/v1/session…), carrying
// the SAME three proofs every text turn carries — a signed session binding, a
// signed resource-scope delegation, and the persona header — minted fresh per
// turn from the injected binding secret. The eve/client Client/ClientSession
// is what @zigil/agent-react's useEveRuntimeSession wraps; here we drive it
// directly because a stdio subprocess has no React.
//
// Only ONE thing crosses back: MessageResult.message — the reduced completed
// assistant text, which is the speakable surface. `.events`, `.data`, tool
// args/results, and reasoning never leave this function. That is the
// speakable-text discipline applied at the delegation boundary.
//
// CREDENTIAL FENCE (VOX.6.1 — the honest gap, flagged loud): Eve's channel
// auth (eve-auth.ts) verifies a web-signed EdDSA bearer JWT, which only the
// web server can mint. This subprocess can mint the binding + scope proofs but
// NOT that bearer. So the bearer is injected at launch when available; absent
// it, the delegate turn authenticates only where Eve accepts local-dev auth
// (SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH — David's local live-verify). A production
// deployment without an injected bearer will be refused by Eve at the door.
// Bearer refresh across a call longer than the token lifetime is VOX.6.2.

import { Client } from "eve/client"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

import type { CoordinatorBoundContext } from "./context"

/** The persona header Eve's channel reads (mirrors the web submission path). */
const AGENT_PERSONA_HEADER = "x-sigil-persona-id"
/** The scope header Eve's requireAuthorizedResourceScope reads. */
const AGENT_SCOPE_HEADER = "x-sigil-scope"
/** Proofs are short-lived; a delegate round-trip is seconds. */
const PROOF_LIFETIME_SECONDS = 60

/** What delegate-core needs from Eve, and nothing more, so its tests fake it
 *  in a few lines rather than mocking the whole client. */
export interface EveDelegatePort {
  /** Submit one plain-language request into the bound Eve thread and return
   *  ONLY the speakable reply text. */
  submit(request: string): Promise<EveDelegateResult>
}

export interface EveDelegateResult {
  /** The completed assistant text — the only thing a voice may speak. */
  readonly message: string | undefined
  readonly status: "completed" | "failed" | "waiting"
}

/**
 * The live port. The relay scope stays `session:<applicationThreadId>` — the
 * same scope a text turn in that thread carries — so one authorization path
 * covers voice and text alike.
 */
export function createEveDelegatePort(
  context: CoordinatorBoundContext,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): EveDelegatePort {
  const relayScope = `session:${context.applicationThreadId}`
  const client = new Client({
    host: context.eveOrigin,
    ...(context.bearer ? { auth: { bearer: context.bearer } } : {}),
    headers: () => mintHeaders(context, relayScope, now()),
  })
  const session = client.session(
    context.eveSessionId ? { sessionId: context.eveSessionId, streamIndex: 0 } : undefined,
  )

  return {
    async submit(request) {
      const response = await session.send({ message: request })
      const result = await response.result()
      // Deliberately narrow: only message and status. Reading result.events or
      // result.data here would reopen the channel this discipline closes.
      return { message: result.message, status: result.status }
    },
  }
}

function mintHeaders(
  context: CoordinatorBoundContext,
  relayScope: string,
  nowSeconds: number,
): Record<string, string> {
  const expiresAt = nowSeconds + PROOF_LIFETIME_SECONDS
  const binding = issueAgentSessionBinding(
    {
      applicationThreadId: context.applicationThreadId,
      personaId: context.personaId,
      homeScopeId: context.homeScopeId,
      initialPerspective: context.initialPerspective,
      additionalContextScopeIds: [...context.additionalContextScopeIds],
      ...(context.eveSessionId ? { eveSessionId: context.eveSessionId } : {}),
      subject: context.principalId,
      expiresAt,
    },
    context.bindingSecret,
  )
  const scopeProof = issueScopeDelegation(
    { scope: relayScope, subject: context.principalId, expiresAt },
    context.bindingSecret,
  )
  return {
    [AGENT_PERSONA_HEADER]: context.personaId,
    [AGENT_SESSION_BINDING_HEADER]: binding,
    [AGENT_SCOPE_HEADER]: relayScope,
    [AGENT_SCOPE_PROOF_HEADER]: scopeProof,
  }
}
