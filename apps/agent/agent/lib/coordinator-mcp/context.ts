// The bound context a live voice session hands its coordinator MCP server.
//
// The realtime offer route already reconstructs, from signed proofs, exactly
// which application thread / principal / persona this call belongs to
// (requireBoundApplicationThread in ../realtime-voice.ts). VOX.5 discarded it.
// This module is the wire that carries it into the per-session MCP subprocess
// codex launches, so `delegate_to_eve` acts inside the SAME bound Eve thread
// the user is looking at — never a thread it named itself.
//
// It travels as ONE JSON blob in an env var (not argv: argv is world-readable
// via `ps`, and this blob carries the binding secret). The subprocess parses
// it once at startup and fails closed if anything required is missing — a
// coordinator that came up without its bound context must not fall back to
// some ambient default thread.
//
// CREDENTIAL FENCE (VOX.6.1, honest gap — see the report and eve-delegate-port
// .ts): `bindingSecret` lets the subprocess mint the binding + scope proofs
// every Eve turn carries, but Eve ALSO wants a web-signed EdDSA bearer JWT
// (eve-auth.ts, ≤5min) that only the web server can sign. `bearer` carries one
// injected at launch when available; `allowLocalDevAuth` is the local-verify
// escape hatch. Bearer refresh across a long call is VOX.6.2.

import type { CoordinatorAuthorityGrant } from "@workspace/agent-contracts/coordinator-authority"
import type { AgentSessionScopePerspective } from "@workspace/agent-contracts/session-binding"

/** The env var the launch config sets and `server.ts` reads. */
export const COORDINATOR_CONTEXT_ENV_VAR = "SIGIL_COORDINATOR_CONTEXT"

export interface CoordinatorBoundContext {
  /** The Sigil application thread this call is bound to. */
  readonly applicationThreadId: string
  /** The human this call belongs to (the Eve session subject). */
  readonly principalId: string
  readonly personaId: string
  /**
   * The bound thread's execution binding, re-minted verbatim on every delegate
   * turn. Eve's owner store rejects a turn whose execution binding does not
   * match the one the web server established for this session, so these carry
   * as-is — the bare homeScopeId, its perspective, and any additional context
   * scopes — NOT the container form used for authority below.
   */
  readonly homeScopeId: string
  readonly initialPerspective: AgentSessionScopePerspective
  readonly additionalContextScopeIds: readonly string[]
  /** Present once the application thread has persisted its Eve session id, so
   *  the delegate turn resumes that conversation rather than starting a new
   *  one. Absent on a thread that has not run a turn yet. */
  readonly eveSessionId?: string
  /**
   * The container scope (`project:<id>` / `workspace:<id>`) the coordinator's
   * authority is checked against — resolved from the bound thread's bare
   * homeScopeId on the Eve side, where the registries live. The subprocess
   * never resolves scopes itself; it only checks a grant against this string.
   */
  readonly authorityResourceScope: string
  /** The capability class a grant must name to authorize delegation. */
  readonly capability: string
  /** Where Eve listens. */
  readonly eveOrigin: string
  /** SIGIL_AGENT_BINDING_SECRET — mints binding + scope proofs, not a bearer. */
  readonly bindingSecret: string
  /** The active delegated grants, snapshotted at launch. Empty means the
   *  coordinator can speak but never delegate. */
  readonly grants: readonly CoordinatorAuthorityGrant[]
  /** A web-signed Eve bearer, when the launch could obtain one. The fence. */
  readonly bearer?: string
  /** Whether Eve accepts local-dev auth for David's live verification. */
  readonly allowLocalDevAuth: boolean
}

/** Serialize for the subprocess env. One var, one blob. */
export function serializeCoordinatorContext(
  context: CoordinatorBoundContext,
): Record<string, string> {
  return { [COORDINATOR_CONTEXT_ENV_VAR]: JSON.stringify(context) }
}

export class CoordinatorContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CoordinatorContextError"
  }
}

/**
 * Parse and validate the blob from the environment. Throws
 * CoordinatorContextError on anything missing or malformed — the subprocess
 * has no safe default to fall back to.
 */
export function parseCoordinatorContext(
  env: NodeJS.ProcessEnv,
): CoordinatorBoundContext {
  const raw = env[COORDINATOR_CONTEXT_ENV_VAR]
  if (!raw || !raw.trim()) {
    throw new CoordinatorContextError(
      `${COORDINATOR_CONTEXT_ENV_VAR} is required — the coordinator has no bound thread without it.`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new CoordinatorContextError(
      `${COORDINATOR_CONTEXT_ENV_VAR} is not valid JSON: ${(error as Error).message}`,
    )
  }
  return validateCoordinatorContext(parsed)
}

/** Shared by parse and by tests; also the last gate before a launch trusts a
 *  context it built. */
export function validateCoordinatorContext(
  value: unknown,
): CoordinatorBoundContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CoordinatorContextError("Coordinator context must be an object.")
  }
  const candidate = value as Record<string, unknown>
  const applicationThreadId = requireString(candidate, "applicationThreadId")
  const principalId = requireString(candidate, "principalId")
  const personaId = requireString(candidate, "personaId")
  const homeScopeId = requireString(candidate, "homeScopeId")
  const initialPerspective = validatePerspective(candidate.initialPerspective)
  const additionalContextScopeIds = validateStringList(
    candidate.additionalContextScopeIds,
    "additionalContextScopeIds",
  )
  const authorityResourceScope = requireString(
    candidate,
    "authorityResourceScope",
  )
  const capability = requireString(candidate, "capability")
  const eveOrigin = requireString(candidate, "eveOrigin")
  const bindingSecret = requireString(candidate, "bindingSecret")
  const eveSessionId = optionalString(candidate, "eveSessionId")
  const bearer = optionalString(candidate, "bearer")
  const allowLocalDevAuth = candidate.allowLocalDevAuth === true
  const grants = validateGrants(candidate.grants)

  return {
    applicationThreadId,
    principalId,
    personaId,
    homeScopeId,
    initialPerspective,
    additionalContextScopeIds,
    ...(eveSessionId ? { eveSessionId } : {}),
    authorityResourceScope,
    capability,
    eveOrigin,
    bindingSecret,
    grants,
    ...(bearer ? { bearer } : {}),
    allowLocalDevAuth,
  }
}

function validatePerspective(value: unknown): AgentSessionScopePerspective {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CoordinatorContextError(
      "Coordinator context initialPerspective must be an object.",
    )
  }
  const perspective = value as Record<string, unknown>
  if (
    typeof perspective.focusScopeId !== "string" ||
    !perspective.focusScopeId.trim()
  ) {
    throw new CoordinatorContextError(
      "Coordinator context initialPerspective.focusScopeId is required.",
    )
  }
  return {
    focusScopeId: perspective.focusScopeId,
    viaScopeIds: validateStringList(
      perspective.viaScopeIds,
      "initialPerspective.viaScopeIds",
    ),
  }
}

function validateStringList(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CoordinatorContextError(
      `Coordinator context \`${label}\` must be a string array.`,
    )
  }
  return [...(value as string[])]
}

function validateGrants(value: unknown): readonly CoordinatorAuthorityGrant[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new CoordinatorContextError("Coordinator context grants must be an array.")
  }
  // Structural transport only: decideDelegatedApproval re-checks every grant
  // against the request, so a forged grant here still authorizes nothing it
  // does not match on. We validate the shape enough to iterate it safely.
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new CoordinatorContextError(`Grant ${index} is not an object.`)
    }
    const grant = entry as Record<string, unknown>
    if (
      typeof grant.id !== "string" ||
      typeof grant.capability !== "string" ||
      typeof grant.principalId !== "string" ||
      typeof grant.resourceScope !== "string" ||
      !Array.isArray(grant.actions)
    ) {
      throw new CoordinatorContextError(`Grant ${index} is missing required fields.`)
    }
    return entry as CoordinatorAuthorityGrant
  })
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new CoordinatorContextError(
      `Coordinator context is missing required string \`${key}\`.`,
    )
  }
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "string" || !value.trim()) {
    throw new CoordinatorContextError(
      `Coordinator context \`${key}\` must be a non-empty string when present.`,
    )
  }
  return value
}
