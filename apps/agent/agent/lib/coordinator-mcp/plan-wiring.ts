// The production wiring that turns Eve's ambient state into a hardened plan.
//
// Kept out of session-plan.ts so that module stays free of registry and env
// singletons and remains the testable core. This one resolves the concrete
// deps: the project/workspace registries (bare homeScopeId -> container scope),
// the delegated grants, the Eve origin the coordinator submits back to, and the
// per-session MCP server entry codex launches.
//
// Annika Finding 1: this ALWAYS returns a plan (never undefined). Every live
// voice session is hardened — exec off — whether or not a coordinator surface
// can be formed. Without a binding secret or a resolvable scope the plan simply
// carries no delegate tool; it never carries ambient exec.
//
// GRANTS, first cut: there is no issuance surface yet (coordinator-authority.ts
// says as much), so production grants resolve to EMPTY — the coordinator comes
// up and refuses every delegation cleanly, exec already disabled. For David's
// local live verification a single grant can be seeded in-memory by setting
// SIGIL_COORDINATOR_DEV_GRANT=1, and only when Eve also accepts local-dev auth
// (SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH). It is never authority in a real deployment.

import { existsSync } from "node:fs"
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

export interface CoordinatorPlanWiringOptions {
  /** SIGIL_AGENT_BINDING_SECRET. Absent, the launch is hardened but exposes no
   *  coordinator tool (the subprocess could not mint the proofs Eve needs). */
  readonly bindingSecret: string | undefined
  readonly env?: NodeJS.ProcessEnv
}

/**
 * Bind the deps and return a `planSession` for createRealtimeVoiceRoutes. It
 * always resolves to a hardened plan; the ambient app-server client is never
 * reachable through this path.
 */
export function createCoordinatorPlanSession(
  options: CoordinatorPlanWiringOptions,
): (input: {
  binding: AgentSessionBindingPayload
  principalId: string
}) => Promise<RealtimeVoiceSessionPlan> {
  const env = options.env ?? process.env
  const bindingSecret = options.bindingSecret
  const authEnvironment = readSigilEveAuthEnvironment(env)
  const eveOrigin = readRuntimeTopology(env).eveOrigin
  const devGrantEnabled =
    authEnvironment.allowLocalDev && env.SIGIL_COORDINATOR_DEV_GRANT === "1"
  const serverLaunch = resolveCoordinatorServerLaunch()

  return (input) =>
    buildCoordinatorSessionPlan(
      {
        ...(bindingSecret ? { bindingSecret } : {}),
        eveOrigin,
        allowLocalDevAuth: authEnvironment.allowLocalDev,
        capability: COORDINATOR_CAPABILITY,
        serverCommand: serverLaunch.command,
        serverArgs: serverLaunch.args,
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

/**
 * The per-session stdio server codex spawns. Deployed, `eve build` emits
 * `server.js` beside this module and we run it with node. In `pnpm dev` the
 * agent runs from `.ts` source under tsx, so no `.js` exists — run `server.ts`
 * with node's tsx loader (tsx is an apps/agent devDependency for exactly this).
 */
function resolveCoordinatorServerLaunch(): {
  command: string
  args: string[]
} {
  const builtJs = fileURLToPath(new URL("./server.js", import.meta.url))
  if (existsSync(builtJs)) {
    return { command: process.execPath, args: [builtJs] }
  }
  const sourceTs = fileURLToPath(new URL("./server.ts", import.meta.url))
  return { command: process.execPath, args: ["--import", "tsx", sourceTs] }
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
