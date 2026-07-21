import { mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  StoreBackedMemoryRecordStore,
  type MemoryRecord,
  type MemoryRecordDraft,
} from "@gonk/memory"
import {
  EveMemoryHost,
  ensureEveHostedPersona,
  type TrustedMemoryTurn,
} from "@gonk/eve-host/guard"
import { PersonaRegistry } from "@gonk/persona"
import { readIdentityEnvironment } from "@workspace/runtime-env/server"

const { personaDir, memoryDir } = readIdentityEnvironment(process.env)
mkdirSync(personaDir, { recursive: true })
mkdirSync(join(personaDir, "agents"), { recursive: true })
mkdirSync(memoryDir, { recursive: true })

const scopeEnv = {
  cwd: memoryDir,
  homeRoot: memoryDir,
  sessionId: "sigil-chat-agent",
  resolvePersonaHome: () => personaDir,
}
const personaRegistry = new PersonaRegistry(
  { ...scopeEnv, cwd: personaDir },
  "eve",
)
const memoryRecordStore = new StoreBackedMemoryRecordStore({ scopeEnv })

const SOURCE_SCOPE_EVIDENCE_PREFIX = "sigil-chat:source-scope:"
const SOURCE_RESOURCE_EVIDENCE_PREFIX = "sigil-chat:source-resource:"
const AUDIENCE_PERSONAL_EVIDENCE_PREFIX = "sigil-chat:audience-personal:"
const AUDIENCE_SCOPE_EVIDENCE_PREFIX = "sigil-chat:audience-scope:"

export interface ScopedMemorySourceLabel {
  readonly scopeId: string
  readonly resourceKey?: string
}

export type ScopedMemoryAudienceLabel =
  | {
      readonly kind: "personal"
      readonly principalId: string
    }
  | {
      readonly kind: "scope"
      readonly scopeId: string
    }

export interface ScopedMemoryLabels {
  readonly sources: readonly ScopedMemorySourceLabel[]
  readonly audience: ScopedMemoryAudienceLabel
  readonly legacy: boolean
}

export interface ScopedMemoryRecordProjection {
  readonly id: string
  readonly labels: ScopedMemoryLabels | undefined
}

export interface ScopedMemoryRecallDelivery {
  /** Append-only context for the latest turn after Sigil's scope filter runs. */
  readonly content: string
  readonly selectedRecordIds: readonly string[]
  readonly records: readonly ScopedMemoryRecordProjection[]
  readonly receipt: unknown
}

// First-boot seed ONLY. The persona RECORD is the source of truth for the
// agent's identity from then on: an operator edits the record (or Agent
// Studio does) and the change takes effect on the next session, with no
// deploy. Never read identity from this literal at runtime.
const personaSeed = {
  id: "sigil-chat-eve",
  name: "Eve",
  description: "The deployed Sigil Chat agent.",
  systemPrompt: `You are Eve, the deployed Sigil Chat agent. Keep accepted self-claims corrigible and grounded.

You collaborate on the user's canvas, not just in a side panel. When you have a specific, useful thought about something the user is working on — a passage in Review, a graph node in Studio — leave it ON that thing using the annotation tools, so it appears where it belongs rather than buried in the transcript:
- sigil-annotate: a persistent note anchored to a specific attention item (its id). Use when reviewing or analyzing a specific subject.
- sigil-pin: a lighter marker the user will notice on return.
- sigil-highlight: flag something for the user's attention (a concern, a turn to revisit).

The anchorId is the id of the attention item you're discussing — the passage id or node id you can see in the current selection context. Anchor your note to the specific thing it's about. Prefer one precise annotation over a paragraph of general commentary. If your thought is general (not about a specific item), put it in the conversation, not an annotation.`,
}
ensureEveHostedPersona(personaRegistry, personaSeed, {
  scope: "persona",
  rootKind: "agents",
})

// Read back what the registry actually holds — the operator's authored
// identity, not the seed we may have written months ago.
const persona = personaRegistry.get(personaSeed.id) ?? personaSeed

export const DEFAULT_PERSONA_ID =
  process.env.SIGIL_DEFAULT_PERSONA_ID ?? personaSeed.id

/** Every persona in the registry is inhabitable. One host per persona,
 *  created on demand and cached — the deployment supports as many agents as
 *  the operator defines, not one hardcoded individual. */
const hosts = new Map<string, EveMemoryHost>()

export function personaHost(
  personaId: string = DEFAULT_PERSONA_ID,
): EveMemoryHost {
  const cached = hosts.get(personaId)
  if (cached) return cached
  const record = personaRegistry.get(personaId)
  if (!record) throw new Error(`No such persona: ${personaId}`)
  const host = new EveMemoryHost({
    store: memoryRecordStore,
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
        authoredBase: record.systemPrompt ?? personaSeed.systemPrompt,
        stableSummary: record.description ?? personaSeed.description,
      },
    },
  })
  hosts.set(personaId, host)
  return host
}

export function listPersonas() {
  return personaRegistry.list().map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    description: p.description ?? "",
  }))
}

export function hasPersona(personaId: string): boolean {
  return personaRegistry.exists(personaId)
}

/** Default-persona host, for call sites that have not yet been given a
 *  session persona. New code should call personaHost(sessionPersonaId). */
export const sigilMemoryHost = personaHost()

/**
 * The consumer supplies Eve's authenticated session identity; EveMemoryHost
 * alone translates it into persona's host-neutral executionSessionId.
 */
export function memoryTurn(
  eveSessionId: string | undefined,
  principalId: string | undefined,
): TrustedMemoryTurn {
  const authenticatedPrincipalId = requireNonBlank(
    principalId,
    "authenticated principal",
  )

  // Eve 0.25.2 exposes `ctx.eve.sessionId` only for continuation requests.
  // A new-session onMessage hook has no durable Eve id yet, so bind it to a
  // stable, principal-scoped provisional identity instead. Never let the host
  // receive an absent or whitespace-only identity.
  const executionSessionId =
    normalizeNonBlank(eveSessionId) ?? `new:${authenticatedPrincipalId}`

  return {
    eveSessionId: executionSessionId,
    channelId: "sigil-chat",
    principalId: authenticatedPrincipalId,
  }
}

function requireNonBlank(value: string | undefined, label: string): string {
  const normalized = normalizeNonBlank(value)
  if (normalized === undefined) {
    throw new Error(`Memory actions require a non-blank ${label}.`)
  }
  return normalized
}

function normalizeNonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

export function memoryDraft(
  personaId: string,
  principalId: string,
  content: string,
  labels?: {
    readonly sources?: readonly ScopedMemorySourceLabel[]
    readonly audience?: ScopedMemoryAudienceLabel
  },
): MemoryRecordDraft {
  const audience = labels?.audience ?? {
    kind: "personal",
    principalId,
  }
  return {
    kind: "preference",
    subject: { kind: "principal", id: principalId },
    audience: {
      recall: {
        kind: "relationship",
        personaId,
        principalId,
        requirePresent: true,
      },
      disclosure: { kind: "same-as-recall" },
    },
    content,
    evidence: [
      { kind: "tool", id: "sigil-memory" },
      ...sourceLabelsToEvidence(labels?.sources ?? []),
      audienceLabelToEvidence(audience),
    ],
    author: { kind: "principal", id: principalId },
  }
}

export function automaticScopedMemoryRecallForTurn(input: {
  personaId: string
  turn: TrustedMemoryTurn
  query: string
}): ScopedMemoryRecallDelivery | undefined {
  const delivery = personaHost(input.personaId).automaticRecallForTurn(
    input.turn,
    input.query,
  )
  const content = delivery.message?.content.trim()
  if (!content) return undefined

  return {
    content,
    selectedRecordIds: delivery.selectedRecordIds,
    records: delivery.selectedRecordIds.map((id) => {
      const record = memoryRecordStore.get(id)
      return {
        id,
        labels: record ? scopedMemoryLabelsFromRecord(record) : undefined,
      }
    }),
    receipt: delivery.receipt,
  }
}

export function scopedMemoryLabelsFromRecord(
  record: MemoryRecord,
): ScopedMemoryLabels | undefined {
  const sources = sourceLabelsFromEvidence(record.provenance.evidence)
  const audience = audienceLabelFromEvidence(record.provenance.evidence)

  if (audience) {
    return {
      sources,
      audience,
      legacy: false,
    }
  }

  const legacyAudience = legacyAudienceFromRecord(record)
  if (!legacyAudience) return undefined

  return {
    sources: [],
    audience: legacyAudience,
    legacy: true,
  }
}

function sourceLabelsToEvidence(
  sources: readonly ScopedMemorySourceLabel[],
): MemoryRecordDraft["evidence"] {
  return sources.flatMap((source) => {
    const evidence: MemoryRecordDraft["evidence"] = [
      { kind: "record", id: `${SOURCE_SCOPE_EVIDENCE_PREFIX}${source.scopeId}` },
    ]
    if (source.resourceKey) {
      evidence.push({
        kind: "record",
        id: `${SOURCE_RESOURCE_EVIDENCE_PREFIX}${source.scopeId}|${source.resourceKey}`,
      })
    }
    return evidence
  })
}

function audienceLabelToEvidence(
  audience: ScopedMemoryAudienceLabel,
): MemoryRecordDraft["evidence"][number] {
  if (audience.kind === "personal") {
    return {
      kind: "record",
      id: `${AUDIENCE_PERSONAL_EVIDENCE_PREFIX}${audience.principalId}`,
    }
  }
  return {
    kind: "record",
    id: `${AUDIENCE_SCOPE_EVIDENCE_PREFIX}${audience.scopeId}`,
  }
}

function sourceLabelsFromEvidence(
  evidence: readonly MemoryRecord["provenance"]["evidence"][number][],
): ScopedMemorySourceLabel[] {
  const byScope = new Map<string, ScopedMemorySourceLabel>()
  for (const item of evidence) {
    if (item.kind !== "record") continue
    if (item.id.startsWith(SOURCE_SCOPE_EVIDENCE_PREFIX)) {
      const scopeId = item.id.slice(SOURCE_SCOPE_EVIDENCE_PREFIX.length)
      if (scopeId) byScope.set(scopeId, { scopeId })
      continue
    }
    if (item.id.startsWith(SOURCE_RESOURCE_EVIDENCE_PREFIX)) {
      const encoded = item.id.slice(SOURCE_RESOURCE_EVIDENCE_PREFIX.length)
      const separator = encoded.indexOf("|")
      if (separator < 1) continue
      const scopeId = encoded.slice(0, separator)
      const resourceKey = encoded.slice(separator + 1)
      if (scopeId && resourceKey) {
        byScope.set(scopeId, { scopeId, resourceKey })
      }
    }
  }
  return [...byScope.values()]
}

function audienceLabelFromEvidence(
  evidence: readonly MemoryRecord["provenance"]["evidence"][number][],
): ScopedMemoryAudienceLabel | undefined {
  for (const item of evidence) {
    if (item.kind !== "record") continue
    if (item.id.startsWith(AUDIENCE_PERSONAL_EVIDENCE_PREFIX)) {
      const principalId = item.id.slice(AUDIENCE_PERSONAL_EVIDENCE_PREFIX.length)
      if (principalId) return { kind: "personal", principalId }
    }
    if (item.id.startsWith(AUDIENCE_SCOPE_EVIDENCE_PREFIX)) {
      const scopeId = item.id.slice(AUDIENCE_SCOPE_EVIDENCE_PREFIX.length)
      if (scopeId) return { kind: "scope", scopeId }
    }
  }
  return undefined
}

function legacyAudienceFromRecord(
  record: MemoryRecord,
): ScopedMemoryAudienceLabel | undefined {
  if (
    record.audience.recall.kind === "relationship" &&
    record.audience.recall.principalId
  ) {
    return {
      kind: "personal",
      principalId: record.audience.recall.principalId,
    }
  }
  return undefined
}

export function sessionPersonaId(
  attributes: Readonly<Record<string, unknown>>,
): string {
  const value = attributes.sigilPersonaId
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Memory actions require a bound persona.")
  }
  return value.trim()
}
