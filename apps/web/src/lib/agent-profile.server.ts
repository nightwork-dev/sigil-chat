// Server-only: PersonaRegistry / EveMemoryHost / the memory store are all
// constructed here, at module scope, over real filesystem paths (node:fs,
// node:path via @gonk/scope). This file must NEVER be imported from
// agent-profile.ts at module scope — only dynamically, inside a server-fn
// handler — or Vite pulls the whole server-only graph into the client
// bundle (node built-ins get externalized and the build fails). See
// agent-threads.ts / agent-threads.server.ts for the established split.
//
// The persona registry is the identity source of truth. Hosts are derived
// from its records on demand, matching the agent's per-persona host pattern.

import {
  StoreBackedMemoryRecordStore,
  type MemoryAuthorizedQueryResult,
  type MemoryDisclosureResult,
  type MemoryRecord,
  type TrustedTurnEnvelope,
} from "@gonk/memory"
import { EveMemoryHost, type TrustedMemoryTurn } from "@gonk/eve-host/guard"
import { PersonaRegistry } from "@gonk/persona"
import { readIdentityEnvironment } from "@workspace/runtime-env/server"

import type { AgentPersonaSummary, AgentProfile } from "./agent-profile"

const { personaDir, memoryDir } = readIdentityEnvironment(process.env)

const scopeEnv = {
  cwd: memoryDir,
  homeRoot: memoryDir,
  sessionId: "sigil-chat-agent",
  resolvePersonaHome: () => personaDir,
}

// Exported so the portrait-serving route can reuse the same registry
// instance instead of standing up a second one.
export const personaRegistry = new PersonaRegistry({ ...scopeEnv, cwd: personaDir }, "eve")

// The store is read-only here: this slice never writes (accept/reject/edit is
// the workbench story). Atomic-rename writes from the agent make reads safe.
const store = new StoreBackedMemoryRecordStore({ scopeEnv })

const hosts = new Map<string, EveMemoryHost>()

function profileHost(personaId: string): EveMemoryHost {
  const cached = hosts.get(personaId)
  if (cached) return cached

  const record = personaRegistry.get(personaId)
  if (!record) throw new Error(`persona ${personaId} not found`)

  const host = new EveMemoryHost({
    store,
    persona: {
      record,
      authoredBaseId: `${record.id}-v1`,
      identityFloor: {
        revision: `${record.id}-v1`,
        selectedRecordIds: [],
        caps: {
          maxRecords: 3,
          maxContentCharsPerRecord: 300,
          maxTotalContentChars: 600,
        },
        stableSummaryTokenBudget: 80,
        selectedSelfRecordCap: 3,
        dynamicTokenBudget: 240,
        authoredBase: record.systemPrompt ?? "",
        stableSummary: record.description ?? record.name ?? record.id,
      },
    },
  })
  hosts.set(personaId, host)
  return host
}

const READ_CHANNEL = "sigil-chat"

/** A trusted turn for a read-only profile query. The session id is synthetic;
 * only the principalId is load-bearing for disclosure. */
function readTurn(principalId: string): TrustedMemoryTurn {
  return { eveSessionId: "profile-read", channelId: READ_CHANNEL, principalId }
}

// EveMemoryHost.queryAuthorized isn't on the public class surface; the store
// takes a TrustedTurnEnvelope directly. Build one from a bound session.
function readEnvelope(principalId: string, personaId: string, host: EveMemoryHost): TrustedTurnEnvelope {
  const binding = host.bindSession({
    eveSessionId: "profile-read",
    channelId: READ_CHANNEL,
  })
  return {
    binding: binding as unknown as TrustedTurnEnvelope["binding"],
    principalId,
    presentPrincipalIds: [principalId],
    // queryAuthorized's isAuthorizedForRecall gates on
    // grantedScopeIds.includes(`${record.scope.tier}:${record.scope.id}`)
    // (@gonk/memory dist/chunk-QDOF3JKW.js, scopeGrantId) — an empty array
    // here silently rejects every record regardless of disclosure audience.
    // The owner reading their own deployed persona's memory is exactly the
    // grant this profile exists to make: the persona-tier scope for the one
    // persona this view renders, nothing broader.
    grantedScopeIds: [`persona:${personaId}`],
  }
}

function disclosedAuthorized(result: MemoryAuthorizedQueryResult): MemoryDisclosureResult[] {
  return result.disclosure.filter((d) => d.disclosure.allowed)
}

function disclosedAccepted(result: MemoryAuthorizedQueryResult): MemoryRecord[] {
  const allowed = new Set(disclosedAuthorized(result).map((d) => d.id))
  return store.list().filter((r) => allowed.has(r.id) && r.lifecycle.status === "accepted")
}

/** The primary definitions visible to this host, one row per persona id. */
export function listAgentPersonas(): AgentPersonaSummary[] {
  const seen = new Set<string>()
  const personas: AgentPersonaSummary[] = []
  for (const listed of personaRegistry.list()) {
    if (seen.has(listed.id)) continue
    seen.add(listed.id)
    const persona = personaRegistry.get(listed.id) ?? listed
    personas.push({
      id: persona.id,
      name: persona.name ?? persona.id,
      description: persona.description ?? "",
    })
  }
  return personas
}

/** The read-only projection the profile view renders, for one owner principal. */
export function loadAgentProfile(principalId: string, personaId: string): AgentProfile {
  const persona = personaRegistry.get(personaId)
  if (!persona) throw new Error(`persona ${personaId} not found`)
  const host = profileHost(personaId)

  // Self-model: the identity floor at session start — the SAME projection
  // the agent itself wakes on (what you see IS what it is). Confirmed shape
  // (EveIdentityContext, @gonk/eve-host/guard dist/guard.d.ts):
  // { binding, markdown, policyRevision, selectedRecordIds: readonly string[] }.
  // There is no `records` field — the floor selects record IDs, not bodies —
  // so the accepted self-claims are read back through the store by id.
  const identity = host.identityAtSessionStart(readTurn(principalId))
  const selfClaims = identity.selectedRecordIds
    .map((id) => store.get(id))
    .filter((r): r is MemoryRecord => r !== undefined)

  // Authorized memory disclosure for this principal.
  const authorized = store.queryAuthorized(readEnvelope(principalId, personaId, host))
  const accepted = disclosedAccepted(authorized)

  // Candidates: queryAuthorized's disclosure list is built for the accepted
  // recall/prompt-overlay path — it does not surface pending candidates.
  // The raw store list filtered to candidate status is used instead (the
  // owner is implicitly authorized to see their own agent's pending
  // records; this is a stronger authorization, not a weaker one, than what
  // queryAuthorized grants). Prefer authorized candidate disclosure once the
  // memory substrate exposes it.
  const candidates = store.list().filter((r) => r.owner.personaId === personaId && r.lifecycle.status === "candidate")

  const hasPortrait = personaRegistry.portraitFor(personaId) !== undefined

  return {
    persona,
    lineage: {
      authoredBaseId: identity.binding.authoredBaseId,
      policyRevision: identity.policyRevision,
    },
    hasPortrait,
    selfClaims,
    memory: { accepted, candidates },
  }
}
