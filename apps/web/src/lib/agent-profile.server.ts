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
  type MemoryRecordDraft,
  type MemoryRecord,
  type TrustedTurnEnvelope,
} from "@gonk/memory"
import { EveMemoryHost, type TrustedMemoryTurn } from "@gonk/eve-host/guard"
import { PORTRAIT_BLOB_KEY, PersonaRegistry } from "@gonk/persona"
import { readIdentityEnvironment } from "@workspace/runtime-env/server"

import type {
  AgentMemoryCorrectionInput,
  AgentPersonaSummary,
  AgentPersonaUpdateInput,
  AgentProfile,
} from "./agent-profile"

const { personaDir, memoryDir } = readIdentityEnvironment(process.env)

const scopeEnv = {
  cwd: memoryDir,
  homeRoot: memoryDir,
  sessionId: "sigil-chat-agent",
  resolvePersonaHome: () => personaDir,
}

// Exported so the portrait-serving route can reuse the same registry
// instance instead of standing up a second one.
export const personaRegistry = new PersonaRegistry(
  { ...scopeEnv, cwd: personaDir },
  "eve",
)

// All writes below use the same StoreBackedMemoryRecordStore and PersonaRegistry
// that Eve uses. Store writes are atomic rename operations; the agent can read
// safely while the owner curates memory or updates an identity.
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
function readEnvelope(
  principalId: string,
  personaId: string,
  host: EveMemoryHost,
): TrustedTurnEnvelope {
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

function disclosedAuthorized(
  result: MemoryAuthorizedQueryResult,
): MemoryDisclosureResult[] {
  return result.disclosure.filter((d) => d.disclosure.allowed)
}

function disclosedAccepted(
  result: MemoryAuthorizedQueryResult,
): MemoryRecord[] {
  const allowed = new Set(disclosedAuthorized(result).map((d) => d.id))
  return store
    .list()
    .filter((r) => allowed.has(r.id) && r.lifecycle.status === "accepted")
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
      hasPortrait: personaRegistry.portraitFor(persona.id) !== undefined,
    })
  }
  return personas
}

/** The read-only projection the profile view renders, for one owner principal. */
export function loadAgentProfile(
  principalId: string,
  personaId: string,
): AgentProfile {
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
  const authorized = store.queryAuthorized(
    readEnvelope(principalId, personaId, host),
  )
  const accepted = disclosedAccepted(authorized)

  // Candidates: queryAuthorized's disclosure list is built for the accepted
  // recall/prompt-overlay path — it does not surface pending candidates.
  // The raw store list filtered to candidate status is used instead (the
  // owner is implicitly authorized to see their own agent's pending
  // records; this is a stronger authorization, not a weaker one, than what
  // queryAuthorized grants). Prefer authorized candidate disclosure once the
  // memory substrate exposes it.
  const candidates = store
    .list()
    .filter(
      (r) =>
        r.owner.personaId === personaId && r.lifecycle.status === "candidate",
    )

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

/** Owner-authenticated identity editing. The registry remains the source of
 * truth, and dropping the cached profile host ensures the next profile read
 * rebuilds its identity floor from the revised record. */
export function updateAgentPersonaProfile(
  principalId: string,
  input: AgentPersonaUpdateInput,
): AgentProfile {
  assertPersonaExists(input.personaId)
  personaRegistry.update(input.personaId, {
    name: input.name,
    description: input.description,
    systemPrompt: input.systemPrompt || undefined,
  })
  hosts.delete(input.personaId)
  return loadAgentProfile(principalId, input.personaId)
}

/** Portraits are private persona-tier blobs, never public source assets. */
export async function writeAgentPortrait(
  principalId: string,
  personaId: string,
  bytes: Uint8Array,
): Promise<AgentProfile> {
  assertPersonaExists(personaId)
  const personaScope = personaRegistry.scopeFor(personaId)
  if (!personaScope)
    throw new Error(`persona ${personaId} has no writable scope`)
  await personaScope.putBlob(PORTRAIT_BLOB_KEY, bytes, "persona", {
    mimeType: "image/png",
  })
  return loadAgentProfile(principalId, personaId)
}

/** Candidate acceptance is the one deliberate promotion path exposed by the
 * current memory contract. It retains the record id and transition history. */
export function acceptAgentMemoryCandidate(
  principalId: string,
  personaId: string,
  recordId: string,
): AgentProfile {
  assertOwnedMemory(personaId, recordId, "candidate")
  store.acceptCandidate(recordId, { reason: "review" })
  return loadAgentProfile(principalId, personaId)
}

/** Archive is the reversible removal semantic the memory host exposes for an
 * accepted record. It deliberately does not pretend candidates can be
 * rejected: that transition is not in the current Gonk record contract. */
export function archiveAgentMemoryRecord(
  principalId: string,
  personaId: string,
  recordId: string,
): AgentProfile {
  assertOwnedMemory(personaId, recordId, "accepted")
  profileHost(personaId).forget(memoryTurnForOwner(principalId), recordId)
  return loadAgentProfile(principalId, personaId)
}

/** Correction creates a new accepted record and supersedes the old one via
 * EveMemoryHost, preserving the lifecycle/provenance semantics that direct
 * filesystem edits would lose. */
export function correctAgentMemoryRecord(
  principalId: string,
  input: AgentMemoryCorrectionInput,
): AgentProfile {
  const target = assertOwnedMemory(input.personaId, input.recordId, "accepted")
  const replacement: MemoryRecordDraft = {
    kind: target.kind,
    subject: target.subject,
    audience: target.audience,
    content: input.content,
    evidence: [{ kind: "tool", id: "sigil-agent-studio" }],
    author: { kind: "principal", id: principalId },
  }
  profileHost(input.personaId).correct(
    memoryTurnForOwner(principalId),
    input.recordId,
    replacement,
  )
  return loadAgentProfile(principalId, input.personaId)
}

function assertPersonaExists(personaId: string): void {
  if (!personaRegistry.exists(personaId))
    throw new Error(`persona ${personaId} not found`)
}

function assertOwnedMemory(
  personaId: string,
  recordId: string,
  status: MemoryRecord["lifecycle"]["status"],
): MemoryRecord {
  assertPersonaExists(personaId)
  const record = store.get(recordId)
  if (!record) throw new Error(`memory record ${recordId} not found`)
  if (record.owner.personaId !== personaId || record.scope.id !== personaId) {
    throw new Error("Memory record belongs to another persona.")
  }
  if (record.lifecycle.status !== status) {
    throw new Error(
      `Memory record is ${record.lifecycle.status}, not ${status}.`,
    )
  }
  return record
}

function memoryTurnForOwner(principalId: string): TrustedMemoryTurn {
  return {
    eveSessionId: "profile-curation",
    channelId: READ_CHANNEL,
    principalId,
    presentPrincipalIds: [principalId],
    grantedScopeIds: [],
  }
}
