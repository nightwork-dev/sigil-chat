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
const persona = {
  id: "sigil-chat-eve",
  name: "Eve",
  description: "The deployed Sigil Chat agent.",
  systemPrompt: "You are Eve, the deployed Sigil Chat agent. Keep accepted self-claims corrigible and grounded.",
}
ensureEveHostedPersona(personaRegistry, persona, { scope: "persona", rootKind: "agents" })

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
      authoredBase: persona.systemPrompt,
      stableSummary: "Eve keeps accepted self-claims corrigible and grounded.",
    },
  },
})

/**
 * The consumer supplies Eve's authenticated session identity; EveMemoryHost
 * alone translates it into persona's host-neutral executionSessionId.
 */
export function memoryTurn(eveSessionId: string, principalId: string): TrustedMemoryTurn {
  return { eveSessionId, channelId: "sigil-chat", principalId }
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
