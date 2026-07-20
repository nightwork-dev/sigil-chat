import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { StoreBackedMemoryRecordStore, type MemoryRecordDraft } from "@gonk/memory"
import { EveMemoryHost, ensureEveHostedPersona, type TrustedMemoryTurn } from "@gonk/eve-host/guard"
import { PersonaRegistry } from "@gonk/persona"

const personaDir = resolve(process.env.SIGIL_PERSONA_DIR ?? ".data/persona")
const memoryDir = resolve(process.env.SIGIL_MEMORY_DIR ?? ".data/memory")
mkdirSync(personaDir, { recursive: true })
mkdirSync(resolve(personaDir, "agents"), { recursive: true })
mkdirSync(memoryDir, { recursive: true })

const scopeEnv = {
  cwd: memoryDir,
  homeRoot: memoryDir,
  sessionId: "sigil-chat-agent",
  resolvePersonaHome: () => personaDir,
}
const personaRegistry = new PersonaRegistry({ ...scopeEnv, cwd: personaDir }, "eve")

// First-boot seed ONLY. The persona RECORD is the source of truth for the
// agent's identity from then on: an operator edits the record (or Agent
// Studio does) and the change takes effect on the next session, with no
// deploy. Never read identity from this literal at runtime.
const personaSeed = {
  id: "sigil-chat-eve",
  name: "Eve",
  description: "The deployed Sigil Chat agent.",
  systemPrompt: "You are Eve, the deployed Sigil Chat agent. Keep accepted self-claims corrigible and grounded.",
}
ensureEveHostedPersona(personaRegistry, personaSeed, { scope: "persona", rootKind: "agents" })

// Read back what the registry actually holds — the operator's authored
// identity, not the seed we may have written months ago.
const persona = personaRegistry.get(personaSeed.id) ?? personaSeed

export const sigilMemoryHost = new EveMemoryHost({
  store: new StoreBackedMemoryRecordStore({ scopeEnv }),
  persona: {
    record: persona,
    authoredBaseId: "sigil-chat-agent-v1",
    identityFloor: {
      revision: "sigil-chat-eve-v1",
      selectedRecordIds: [],
      caps: { maxRecords: 3, maxContentCharsPerRecord: 300, maxTotalContentChars: 600 },
      stableSummaryTokenBudget: 80,
      selectedSelfRecordCap: 3,
      dynamicTokenBudget: 240,
      authoredBase: persona.systemPrompt ?? personaSeed.systemPrompt,
      stableSummary: persona.description ?? personaSeed.description,
    },
  },
})

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
  const executionSessionId = normalizeNonBlank(eveSessionId)
    ?? `new:${authenticatedPrincipalId}`

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

export function memoryDraft(principalId: string, content: string): MemoryRecordDraft {
  return {
    kind: "preference",
    subject: { kind: "principal", id: principalId },
    audience: { recall: { kind: "relationship", personaId: "sigil-chat-eve", principalId, requirePresent: true }, disclosure: { kind: "same-as-recall" } },
    content,
    evidence: [{ kind: "tool", id: "sigil-memory" }],
    author: { kind: "principal", id: principalId },
  }
}
