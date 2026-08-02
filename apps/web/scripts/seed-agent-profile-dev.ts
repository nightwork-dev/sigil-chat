// Local-dev seed for exercising the Agent Studio profile view (/agents)
// without a live Eve chat session. Not part of the app bundle; run with
// `tsx scripts/seed-agent-profile-dev.ts` to populate the shared local persona
// and memory stores. Safe to re-run (idempotent, guarded by `alreadySeeded`).
// Disposable fixtures use an explicit seed authority; product writes use the
// owner-facing host authority in agent-profile.server.ts.

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  StoreBackedMemoryRecordStore,
  type MemoryAdmissionAuthority,
  type MemoryRecordDraft,
  type TrustedTurnEnvelope,
} from "@gonk/memory"
import { createPersonaExecutionBinding, PersonaRegistry } from "@gonk/persona"
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

function writeRecord(
  partial: Pick<MemoryRecordDraft, "kind" | "subject" | "content"> & {
    status: "accepted" | "candidate"
  },
) {
  if (alreadySeeded(partial.content)) return
  const now = Date.now()
  const envelope: TrustedTurnEnvelope = {
    binding: {
      kind: "persona",
      ...createPersonaExecutionBinding({
        personaId: PERSONA.id,
        authoredBaseId: `${PERSONA.id}-v1`,
        channelId: "sigil-chat",
        executionSessionId: "agent-profile-dev-seed",
        boundAt: now,
      }),
    },
    principalId: "owner",
    presentPrincipalIds: ["owner"],
    presentActorInstanceIds: [],
    grantedScopeIds: [`persona:${PERSONA.id}`],
    roleIds: ["owner"],
  }
  const authority: MemoryAdmissionAuthority = {
    authorityId: "sigil-chat-agent-profile-dev-seed",
    authorityRevision: "v1",
    decide: () => ({
      outcome: {
        kind: "admit",
        status: partial.status,
        reason: partial.status === "accepted" ? "explicit-remember" : "review",
      },
      decidedAt: now,
    }),
  }
  const receipt = store.execute(
    envelope,
    {
      command: {
        kind: "propose",
        draft: {
          kind: partial.kind,
          subject: partial.subject,
          audience: {
            recall: { kind: "persona", personaId: PERSONA.id },
            disclosure: { kind: "same-as-recall" },
          },
          content: partial.content,
          author: { kind: "principal", id: "owner" },
        },
        origin: {
          source: partial.status === "accepted" ? "stated" : "inferred",
          modelInvolved: partial.status === "candidate",
          producer: {
            componentId: "sigil-chat-agent-profile-dev-seed",
            componentRevision: "v1",
          },
          evidence: [{ kind: "tool", id: "seed-agent-profile-dev" }],
        },
      },
      idempotencyKey: `sigil-chat-agent-profile-dev-seed:${partial.content}`,
      ...(partial.status === "accepted"
        ? { policyAction: "explicit-remember" as const }
        : {}),
    },
    authority,
    {
      revision: "sigil-chat-agent-profile-dev-seed-v1",
      createId: nextId,
      now: () => now,
    },
  )
  if (receipt.outcome.kind !== "committed") {
    throw new Error(`Memory seed was refused: ${receipt.outcome.code}`)
  }
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
