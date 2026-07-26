// Turn a verified voice binding into a hardened launch plan (Eve side).
//
// Annika Finding 1 (BLOCKING, fixed): exec-hardening is UNCONDITIONAL. Every
// live voice session launches into an isolated CODEX_HOME with the built-in
// shell tools disabled, read-only sandbox, and no interactive approvals —
// whether or not a coordinator can be formed. There is no path here that yields
// the ambient client. Scope and grant decide only ONE thing: whether the
// coordinator MCP delegate surface is present at all.
//
//   scope resolves (+ any grants) -> hardened + coordinator MCP (delegates
//     when a grant matches, refuses cleanly otherwise).
//   scope does NOT resolve         -> hardened, NO coordinator tool. The voice
//     agent can talk and cannot act; exec is still gone.
//
// The two scopes the spec names diverge here: the bound thread's homeScopeId is
// a BARE id; the registries (via deps.resolveAuthorityScope) resolve it to the
// container form (`project:`/`workspace:`) the coordinator's authority is
// checked in. The Eve turn the coordinator later submits still runs under
// `session:<thread>`.

import { RealtimeAppServerClient } from "../realtime-appserver"
import type {
  RealtimeVoiceClient,
  RealtimeVoiceSessionPlan,
} from "../realtime-voice"
import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"
import type { CoordinatorAuthorityGrant } from "@workspace/agent-contracts/coordinator-authority"
import { coordinatorPrincipalId } from "@workspace/agent-contracts/coordinator-authority"

import type { CoordinatorBoundContext } from "./context"
import type { CoordinatorServerInput } from "./launch-config"
import { materializeCoordinatorHome } from "./materialize-codex-home"

/** The prompt a coordinator-enabled thread runs under: it CAN act, through the
 *  one tool, and stays honest about what it cannot see. The image-view caveat
 *  is deliberate — codex keeps ViewImageHandler registered even with the shell
 *  tools off (Annika low-sev), so the prompt does not over-promise. */
export const REALTIME_COORDINATOR_CONTEXT = [
  "You are the live voice COORDINATOR for Sigil Chat. You speak with the user",
  "directly, and when they ask you to actually DO something in the app you call",
  "the `delegate_to_eve` tool: it hands your plain-language request to the",
  "user's real Eve agent — its persona, memory, tools, and the same conversation",
  "the app shows — and gives you back Eve's reply to speak. Prefer delegating",
  "real work over describing it. You still cannot see the app's screen, route,",
  "selection, or Eve's transcript, so describe what the user wants rather than",
  "claiming to see it. `delegate_to_eve` is your only way to act on the app; you",
  "have no shell, file, or command authority on this machine (you may be able to",
  "view a shared image, and nothing more). If a delegation comes back saying it",
  "is not authorized, tell the user plainly that they need to approve it from the",
  "app first.",
].join(" ")

/** The prompt when no coordinator surface could be formed: exec is still off,
 *  but there is no delegate tool, so the agent must not claim it can act. */
export const REALTIME_HARDENED_CONTAINMENT_CONTEXT = [
  "You are the live voice agent for Sigil Chat, running as a separate local",
  "Codex realtime thread with NO app tools connected for this session and NO",
  "shell, file, or command authority (you may be able to view a shared image,",
  "and nothing more). You cannot see or act on the Sigil application — its",
  "route, workspace, selection, persona, transcript, memory, or tools. If asked",
  "to act on the app, say plainly that this voice session is not connected to",
  "those tools and the user should use text chat for that. Never claim to see or",
  "act on app state.",
].join(" ")

export interface CoordinatorSessionPlanDeps {
  /** Without it the subprocess could not mint the proofs an Eve turn needs, so
   *  no coordinator surface is formed — but the launch still hardens exec. */
  readonly bindingSecret?: string
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
  /** Injected for tests so the resolved launch args/env can be captured; the
   *  default builds the real isolated-home app-server client. */
  createRealtimeClient?: (input: {
    args: readonly string[]
    env: NodeJS.ProcessEnv
  }) => RealtimeVoiceClient
}

export interface CoordinatorSessionPlanInput {
  readonly binding: AgentSessionBindingPayload
  readonly principalId: string
}

/**
 * Always returns a hardened plan — never undefined, never ambient. The plan
 * carries a coordinator MCP surface only when the authority scope resolves.
 */
export async function buildCoordinatorSessionPlan(
  deps: CoordinatorSessionPlanDeps,
  input: CoordinatorSessionPlanInput,
): Promise<RealtimeVoiceSessionPlan> {
  const coordinator = await resolveCoordinatorServer(deps, input)
  const home = await materializeCoordinatorHome(
    coordinator ? { coordinator } : {},
  )
  const createRealtimeClient =
    deps.createRealtimeClient ??
    ((launch) => new RealtimeAppServerClient(launch))

  // Dev trace: when Eve accepts local-dev auth, log the isolated home path and
  // RETAIN it (no dispose) so David can inspect the realtime rollout + MCP logs
  // after a call. The startup sweep still clears it within the hour. Production
  // (allowLocalDevAuth === false) disposes on session end as before.
  if (deps.allowLocalDevAuth) {
    process.stderr.write(
      `[coordinator] isolated home: ${home.config.codexHome}\n`,
    )
  }

  return {
    prompt: coordinator
      ? REALTIME_COORDINATOR_CONTEXT
      : REALTIME_HARDENED_CONTAINMENT_CONTEXT,
    createClient: () =>
      createRealtimeClient({
        args: home.config.appServerArgs,
        env: { ...process.env, ...home.config.appServerEnv },
      }),
    ...(deps.allowLocalDevAuth ? {} : { dispose: () => home.dispose() }),
  }
}

/** Build the coordinator server input, or undefined to launch hardened-only. */
async function resolveCoordinatorServer(
  deps: CoordinatorSessionPlanDeps,
  input: CoordinatorSessionPlanInput,
): Promise<CoordinatorServerInput | undefined> {
  const { binding, principalId } = input
  // No secret => no proofs => no delegate surface, but still hardened.
  if (!deps.bindingSecret) return undefined
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

  return {
    serverCommand: deps.serverCommand,
    serverArgs: deps.serverArgs,
    context,
  }
}
