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
//
// DEV-SCOPE INJECTION (both flags required): a fresh dev thread's homeScopeId is
// usually NOT a registered project/workspace, so resolveRegisteredAuthorityScope
// returns undefined and — in production — the launch is hardened with NO
// coordinator tool. That is correct for production, but it also meant the local
// verify hatch could never reach the authorized path. So when BOTH dev flags are
// on, an unresolvable home falls back to a synthetic dev scope and the seeded
// grant is minted for that SAME scope, so the coordinator tool attaches and its
// one grant matches. Without both flags this fallback never runs and production
// behaviour is byte-for-byte unchanged.

import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

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
export const COORDINATOR_CAPABILITY = "eve-delegation"

/** The synthetic authority scope a dev thread borrows when its real home does
 *  not resolve. Only reachable with both dev flags; a valid container form so
 *  the grant and the request match. */
export const DEV_FALLBACK_AUTHORITY_SCOPE = "project:sigil-dev-local"

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
        resolveAuthorityScope: (homeScopeId) =>
          resolveDevAuthorityScope({
            homeScopeId,
            baseResolve: resolveRegisteredAuthorityScope,
            devGrantEnabled,
          }),
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
export function resolveRegisteredAuthorityScope(
  homeScopeId: string,
): string | undefined {
  const registries = getProjectWorkspaceRegistries()
  if (registries.projects.get(homeScopeId)) return `project:${homeScopeId}`
  if (registries.workspaces.get(homeScopeId)) return `workspace:${homeScopeId}`
  return undefined
}

/** The real resolution, plus the dev-only synthetic fallback. Returns the
 *  registered scope when there is one; otherwise the synthetic dev scope ONLY
 *  when the dev grant is enabled; otherwise undefined (production hardened,
 *  no tool). Pure — the guard test drives it directly. */
export function resolveDevAuthorityScope(input: {
  homeScopeId: string
  baseResolve: (homeScopeId: string) => string | undefined
  devGrantEnabled: boolean
}): string | undefined {
  const registered = input.baseResolve(input.homeScopeId)
  if (registered) return registered
  return input.devGrantEnabled ? DEV_FALLBACK_AUTHORITY_SCOPE : undefined
}

/**
 * The per-session stdio server codex spawns. Deployed, `eve build` emits
 * `server.js` beside this module and we run it with node. In `pnpm dev` the
 * agent runs from `.ts` source, so no `.js` exists — run `server.ts` with
 * node's tsx loader, resolved to an ABSOLUTE path so it loads regardless of the
 * cwd codex spawns the MCP server in (tsx is an apps/agent devDependency).
 */
export function resolveCoordinatorServerLaunch(): {
  command: string
  args: string[]
} {
  const builtJs = fileURLToPath(new URL("./server.js", import.meta.url))
  if (existsSync(builtJs)) {
    return { command: process.execPath, args: [builtJs] }
  }
  const sourceTs = fileURLToPath(new URL("./server.ts", import.meta.url))
  const require = createRequire(import.meta.url)
  const tsxEntry = pathToFileURL(require.resolve("tsx")).href
  return {
    command: process.execPath,
    args: ["--import", tsxEntry, sourceTs],
  }
}

/** A single in-memory grant for local live verification only. Never persisted,
 *  never reachable without both local-dev flags. */
export function seedDevGrant(
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
