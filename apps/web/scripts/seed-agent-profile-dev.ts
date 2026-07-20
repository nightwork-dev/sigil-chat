// Local-dev seed for exercising the Agent Studio profile view (/agents)
// without a live Eve chat session. Not part of the app bundle; run with
// `tsx scripts/seed-agent-profile-dev.ts` to populate the shared local persona
// and memory stores. Safe to re-run (idempotent, guarded by `alreadySeeded`).
// Disposable fixtures write directly to MemoryRecordStore; product writes go
// through the host authorization path.

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { StoreBackedMemoryRecordStore, type MemoryRecord } from "@gonk/memory"
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

const registry = new PersonaRegistry({ ...scopeEnv, cwd: personaDir }, "eve")

const PERSONA = {
  id: "sigil-chat-demo-agent",
  name: "Demo Agent",
  description: "A local persona for exercising Agent Studio.",
  systemPrompt: "You are a local demo agent. Keep accepted self-claims corrigible and grounded.",
}

if (!registry.exists(PERSONA.id)) {
  registry.create(PERSONA, { scope: "persona", rootKind: "agents" })
  console.log("created persona", PERSONA.id)
} else {
  console.log("persona already exists", PERSONA.id)
}

const store = new StoreBackedMemoryRecordStore({ scopeEnv })

let seq = 0
function nextId(): string {
  seq += 1
  return `seed-${Date.now()}-${seq}`
}

function alreadySeeded(content: string): boolean {
  return store.list().some((r) => r.content === content)
}

function writeRecord(partial: Pick<MemoryRecord, "kind" | "subject" | "content"> & { status: MemoryRecord["lifecycle"]["status"] }) {
  if (alreadySeeded(partial.content)) return
  const now = Date.now()
  const record: MemoryRecord = {
    id: nextId(),
    owner: { personaId: PERSONA.id },
    scope: { tier: "persona", id: PERSONA.id },
    kind: partial.kind,
    subject: partial.subject,
    // "same-as-recall" discloses to whoever is authorized to recall it (the
    // owner viewing their own agent's memory); "persona-only" is reserved
    // for genuinely internal-only material that must never render to any
    // principal, even the owner — not what this seed's example records are.
    audience: { recall: { kind: "persona", personaId: PERSONA.id }, disclosure: { kind: "same-as-recall" } },
    content: partial.content,
    provenance: { source: "stated", evidence: [] },
    lifecycle: { status: partial.status, supersedes: [] },
    createdAt: now,
    updatedAt: now,
  }
  store.create(record)
}

writeRecord({
  kind: "fact",
  subject: { kind: "persona", id: PERSONA.id },
  content: "The demo agent prefers precise, corrigible answers over confident guessing.",
  status: "accepted",
})
writeRecord({
  kind: "fact",
  subject: { kind: "persona", id: PERSONA.id },
  content: "The demo agent is available for testing the Agent Studio profile view.",
  status: "accepted",
})
writeRecord({
  kind: "relationship",
  subject: { kind: "principal", id: "owner" },
  content: "Has an ongoing working relationship with its owner.",
  status: "accepted",
})
writeRecord({
  kind: "preference",
  subject: { kind: "persona", id: PERSONA.id },
  content: "Might prefer shorter responses in the evenings — pattern is still thin.",
  status: "candidate",
})
writeRecord({
  kind: "preference",
  subject: { kind: "persona", id: PERSONA.id },
  content: "Possibly should default to dark theme suggestions — only two data points so far.",
  status: "candidate",
})

console.log("seed complete:", store.list().length, "records")
