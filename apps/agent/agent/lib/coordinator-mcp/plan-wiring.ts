// The production wiring that turns Eve's ambient state into a coordinator plan.
//
// Kept out of session-plan.ts so that module stays free of registry and env
// singletons and remains the testable core. This one resolves the concrete
// deps: the project/workspace registries (bare homeScopeId -> container scope),
// the delegated grants, the Eve origin the coordinator submits back to, and the
// per-session MCP server entry codex launches.
//
// GRANTS, first cut: there is no issuance surface yet (coordinator-authority.ts
// says as much), so production grants resolve to EMPTY — the coordinator comes
// up and refuses every delegation cleanly, exec already disabled. For David's
// local live verification a single grant can be seeded in-memory by setting
// SIGIL_COORDINATOR_DEV_GRANT=1, and only when Eve also accepts local-dev auth
// (SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH). It is never authority in a real deployment;
// it exists so the authorized path can be heard end to end before issuance and
// the credential fence (VOX.6.2) land.

import { fileURLToPath } from "node:url"

import {
  createCoordinatorAuthorityRegistry,
  coordinatorPrincipalId,
  type CoordinatorAuthorityGrant,
} from "@workspace/agent-contracts/coordinator-authority"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

import { readSigilEveAuthEnvironment } from "../eve-auth"
import { getProjectWorkspaceRegistries } from "../project-workspace-registries"
import type { RealtimeVoiceSessionPlan } from "../realtime-voice"
import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"
import { buildCoordinatorSessionPlan } from "./session-plan"

/** The capability a grant must name to authorize delegating into Eve. */
const COORDINATOR_CAPABILITY = "eve-delegation"

/** The compiled stdio server codex spawns per session. `eve build` emits it
 *  beside this module as `.js`; resolved from import.meta.url so it is correct
 *  wherever the agent bundle is deployed. */
const SERVER_ENTRY_URL = new URL("./server.js", import.meta.url)

export interface CoordinatorPlanWiringOptions {
  /** SIGIL_AGENT_BINDING_SECRET. Without it there is no coordinator surface —
   *  the subprocess could not mint the proofs an Eve turn needs. */
  readonly bindingSecret: string | undefined
  readonly env?: NodeJS.ProcessEnv
}

/**
 * Bind the deps and return a `planSession` for createRealtimeVoiceRoutes, or a
 * function that always yields undefined (containment) when no binding secret is
 * configured.
 */
export function createCoordinatorPlanSession(
  options: CoordinatorPlanWiringOptions,
): (input: {
  binding: AgentSessionBindingPayload
  principalId: string
}) => Promise<RealtimeVoiceSessionPlan | undefined> {
  const env = options.env ?? process.env
  const bindingSecret = options.bindingSecret
  if (!bindingSecret) {
    return async () => undefined
  }

  const authEnvironment = readSigilEveAuthEnvironment(env)
  const eveOrigin = readRuntimeTopology(env).eveOrigin
  const devGrantEnabled =
    authEnvironment.allowLocalDev && env.SIGIL_COORDINATOR_DEV_GRANT === "1"

  return (input) =>
    buildCoordinatorSessionPlan(
      {
        bindingSecret,
        eveOrigin,
        allowLocalDevAuth: authEnvironment.allowLocalDev,
        capability: COORDINATOR_CAPABILITY,
        serverCommand: process.execPath,
        serverArgs: [fileURLToPath(SERVER_ENTRY_URL)],
        resolveAuthorityScope,
        resolveGrants: ({ authorityResourceScope }) =>
          devGrantEnabled
            ? seedDevGrant(input.principalId, authorityResourceScope)
            : [],
      },
      input,
    )
}

/** Bare homeScopeId -> container scope, via the same registries every Eve turn
 *  authorizes against. Mirrors canReadMemorySource's home resolution. */
function resolveAuthorityScope(homeScopeId: string): string | undefined {
  const registries = getProjectWorkspaceRegistries()
  if (registries.projects.get(homeScopeId)) return `project:${homeScopeId}`
  if (registries.workspaces.get(homeScopeId)) return `workspace:${homeScopeId}`
  return undefined
}

/** A single in-memory grant for local live verification only. Never persisted,
 *  never reachable without both local-dev flags. */
function seedDevGrant(
  principalId: string,
  authorityResourceScope: string,
): readonly CoordinatorAuthorityGrant[] {
  const registry = createCoordinatorAuthorityRegistry()
  registry.grant({
    actions: ["tool"],
    capability: COORDINATOR_CAPABILITY,
    grantedBy: principalId,
    principalId: coordinatorPrincipalId(principalId),
    resourceScope: authorityResourceScope,
  })
  return registry.listActive()
}
