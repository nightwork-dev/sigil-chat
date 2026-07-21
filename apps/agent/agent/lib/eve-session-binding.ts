import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { readAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

const EVE_SESSION_PATH = /^\/eve\/v1\/session(?:\/|$)/

export class EveSessionBindingVerificationError extends Error {
  constructor() {
    super("The agent session binding is missing or invalid.")
    this.name = "EveSessionBindingVerificationError"
  }
}

/**
 * Verify the server-minted immutable application-thread binding at Eve's HTTP
 * boundary. Non-session routes do not participate in this contract.
 */
export function requireVerifiedEveSessionBinding(
  request: Request,
  principalId: string,
  secretValue: string | undefined,
  now = Math.floor(Date.now() / 1_000),
): AgentSessionBindingPayload | undefined {
  const pathname = new URL(request.url).pathname
  if (!EVE_SESSION_PATH.test(pathname)) return undefined

  const proof = request.headers.get(AGENT_SESSION_BINDING_HEADER)?.trim()
  const secret = secretValue?.trim()
  const binding =
    proof && secret ? readAgentSessionBinding(proof, now, secret) : undefined

  if (!binding || binding.subject !== principalId) {
    throw new EveSessionBindingVerificationError()
  }
  const requestedSessionId = sessionIdFromPath(pathname)
  if (
    (requestedSessionId === undefined && binding.eveSessionId !== undefined) ||
    (requestedSessionId !== undefined &&
      binding.eveSessionId !== undefined &&
      binding.eveSessionId !== requestedSessionId)
  ) {
    throw new EveSessionBindingVerificationError()
  }
  return binding
}

function sessionIdFromPath(pathname: string): string | undefined {
  const match = /^\/eve\/v1\/session\/([^/]+)(?:\/stream)?$/.exec(pathname)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
