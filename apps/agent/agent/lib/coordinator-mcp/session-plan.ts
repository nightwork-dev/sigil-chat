// Turn a verified voice binding into a coordinator launch plan (Eve side).
//
// This is where the two scopes the spec names diverge. The bound thread's
// homeScopeId is a BARE id (a workspace id, or a personal-project id); the
// registries here — the same ones every Eve turn authorizes against — resolve
// it to the container form (`project:<id>` / `workspace:<id>`) that the
// coordinator's authority is checked in. The subprocess never sees a registry;
// it receives the already-resolved scope. The Eve turn the coordinator later
// submits still runs under `session:<thread>`, unchanged.
//
// Building the plan disables the realtime thread's built-in exec (the isolated
// CODEX_HOME) whether or not any grant exists: no grant means the coordinator
// refuses every delegation, but exec is gone either way. The plan is only
// withheld — falling back to VOX.5 containment — when the launch genuinely
// cannot be formed (no binding secret, or a home scope that does not resolve).
// That residual containment path still carries ambient exec; it is called out
// in the VOX.6.1 report for Annika, not silently accepted as safe.

import { RealtimeAppServerClient } from "../realtime-appserver"
import type { RealtimeVoiceSessionPlan } from "../realtime-voice"
import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"
import type { CoordinatorAuthorityGrant } from "@workspace/agent-contracts/coordinator-authority"
import { coordinatorPrincipalId } from "@workspace/agent-contracts/coordinator-authority"

import type { CoordinatorBoundContext } from "./context"
import { materializeCoordinatorHome } from "./materialize-codex-home"

/** The prompt the coordinator-enabled thread runs under. Unlike the VOX.5
 *  containment prompt, this one tells the agent it CAN act — through the one
 *  tool — and holds the same honesty about what it cannot see. */
export const REALTIME_COORDINATOR_CONTEXT = [
  "You are the live voice COORDINATOR for Sigil Chat. You speak with the user",
  "directly, and when they ask you to actually DO something in the app you call",
  "the `delegate_to_eve` tool: it hands your plain-language request to the",
  "user's real Eve agent — its persona, memory, tools, and the same conversation",
  "the app shows — and gives you back Eve's reply to speak. Prefer delegating",
  "real work over describing it. You still cannot see the app's screen, route,",
  "selection, or Eve's transcript, so describe what the user wants rather than",
  "claiming to see it. `delegate_to_eve` is your ONLY way to act: you have no",
  "shell, file, or command authority on this machine. If a delegation comes back",
  "saying it is not authorized, tell the user plainly that they need to approve",
  "it from the app first.",
].join(" ")

export interface CoordinatorSessionPlanDeps {
  readonly bindingSecret: string
  readonly eveOrigin: string
  readonly allowLocalDevAuth: boolean
  /** The capability class a grant must name to authorize delegation. */
  readonly capability: string
  /** Command + args codex spawns for the MCP server (e.g. node + server.js). */
  readonly serverCommand: string
  readonly serverArgs: readonly string[]
  /** Resolve the bare homeScopeId to `project:`/`workspace:` form, or
   *  undefined when it is not a live container the principal belongs to. */
  resolveAuthorityScope(homeScopeId: string): string | undefined
  /** The active delegated grants for this coordinator principal + scope. */
  resolveGrants(input: {
    coordinatorPrincipalId: string
    authorityResourceScope: string
  }): readonly CoordinatorAuthorityGrant[]
  /** A web-signed Eve bearer, when one can be obtained at launch. The fence. */
  resolveBearer?: (principalId: string) => Promise<string | undefined>
}

/**
 * Build the plan, or undefined to keep the containment default. The signature
 * matches RealtimeVoiceRouteOptions.planSession once bound to its deps.
 */
export async function buildCoordinatorSessionPlan(
  deps: CoordinatorSessionPlanDeps,
  input: { binding: AgentSessionBindingPayload; principalId: string },
): Promise<RealtimeVoiceSessionPlan | undefined> {
  const { binding, principalId } = input
  const authorityResourceScope = deps.resolveAuthorityScope(binding.homeScopeId)
  if (!authorityResourceScope) return undefined

  const coordinatorId = coordinatorPrincipalId(principalId)
  const grants = deps.resolveGrants({
    coordinatorPrincipalId: coordinatorId,
    authorityResourceScope,
  })
  const bearer = await deps.resolveBearer?.(principalId)

  const context: CoordinatorBoundContext = {
    applicationThreadId: binding.applicationThreadId,
    principalId,
    personaId: binding.personaId,
    homeScopeId: binding.homeScopeId,
    initialPerspective: binding.initialPerspective,
    additionalContextScopeIds: binding.additionalContextScopeIds,
    ...(binding.eveSessionId ? { eveSessionId: binding.eveSessionId } : {}),
    authorityResourceScope,
    capability: deps.capability,
    eveOrigin: deps.eveOrigin,
    bindingSecret: deps.bindingSecret,
    grants,
    ...(bearer ? { bearer } : {}),
    allowLocalDevAuth: deps.allowLocalDevAuth,
  }

  const home = await materializeCoordinatorHome({
    context,
    serverCommand: deps.serverCommand,
    serverArgs: deps.serverArgs,
  })

  return {
    prompt: REALTIME_COORDINATOR_CONTEXT,
    createClient: () =>
      new RealtimeAppServerClient({
        args: home.config.appServerArgs,
        env: { ...process.env, ...home.config.appServerEnv },
      }),
    dispose: () => home.dispose(),
  }
}
