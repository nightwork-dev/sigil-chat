import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StoreBackedMemoryRecordStore } from "@gonk/memory"

const originalPersonaDir = process.env.SIGIL_PERSONA_DIR
const originalMemoryDir = process.env.SIGIL_MEMORY_DIR
const fixtureRoot = mkdtempSync(join(tmpdir(), "sigil-agent-profile-"))
const personaDir = join(fixtureRoot, "personas")
const memoryDir = join(fixtureRoot, "memory")

function writePersona(
  id: string,
  name: string,
  description: string,
  systemPrompt: string,
) {
  writeFileSync(
    join(personaDir, "agents", `${id}.md`),
    `---\nid: ${id}\nname: ${name}\ndescription: ${description}\n---\n${systemPrompt}\n`,
  )
}

beforeAll(() => {
  mkdirSync(join(personaDir, "agents"), { recursive: true })
  mkdirSync(memoryDir, { recursive: true })
  writePersona("example-one", "One", "First persona", "You are One.")
  writePersona("example-two", "Two", "Second persona", "You are Two.")
  process.env.SIGIL_PERSONA_DIR = personaDir
  process.env.SIGIL_MEMORY_DIR = memoryDir
})

afterAll(() => {
  if (originalPersonaDir === undefined) delete process.env.SIGIL_PERSONA_DIR
  else process.env.SIGIL_PERSONA_DIR = originalPersonaDir
  if (originalMemoryDir === undefined) delete process.env.SIGIL_MEMORY_DIR
  else process.env.SIGIL_MEMORY_DIR = originalMemoryDir
  rmSync(fixtureRoot, { recursive: true, force: true })
})

describe("agent profile persona resolution", () => {
  it("lists every registry persona and loads the selected record", async () => {
    const { listAgentPersonas, loadAgentProfile } =
      await import("./agent-profile.server")

    expect(listAgentPersonas()).toEqual([
      {
        id: "example-one",
        name: "One",
        description: "First persona",
        hasPortrait: false,
      },
      {
        id: "example-two",
        name: "Two",
        description: "Second persona",
        hasPortrait: false,
      },
    ])

    const profile = loadAgentProfile("owner", "example-two")
    expect(profile.persona).toMatchObject({
      id: "example-two",
      name: "Two",
      systemPrompt: "You are Two.",
    })
    expect(profile.lineage).toEqual({
      authoredBaseId: "example-two-v1",
      policyRevision: "example-two-v1",
    })
  })

  it("fails closed for an unknown persona id", async () => {
    const { loadAgentProfile } = await import("./agent-profile.server")
    expect(() => loadAgentProfile("owner", "missing-persona")).toThrow(
      "persona missing-persona not found",
    )
  })

  it("updates an identity and persists a private portrait through the registry", async () => {
    const { loadAgentProfile, updateAgentPersonaProfile, writeAgentPortrait } =
      await import("./agent-profile.server")

    const updated = updateAgentPersonaProfile("owner", {
      personaId: "example-one",
      name: "Revised One",
      description: "Updated persona",
      systemPrompt: "You are the revised One.",
    })
    expect(updated.persona).toMatchObject({
      name: "Revised One",
      description: "Updated persona",
      systemPrompt: "You are the revised One.",
    })

    await writeAgentPortrait(
      "owner",
      "example-one",
      new Uint8Array([137, 80, 78, 71]),
    )
    expect(loadAgentProfile("owner", "example-one").hasPortrait).toBe(true)
  })

  it("curates a candidate through accepted, corrected, and archived lifecycle states", async () => {
    const {
      acceptAgentMemoryCandidate,
      archiveAgentMemoryRecord,
      correctAgentMemoryRecord,
    } = await import("./agent-profile.server")
    const now = Date.now()
    const recordId = "candidate-to-curate"
    const store = new StoreBackedMemoryRecordStore({
      scopeEnv: {
        cwd: memoryDir,
        homeRoot: memoryDir,
        sessionId: "sigil-chat-agent",
        resolvePersonaHome: () => personaDir,
      },
    })
    store.create({
      id: recordId,
      owner: { personaId: "example-two" },
      scope: { tier: "persona", id: "example-two" },
      kind: "fact",
      subject: { kind: "persona", id: "example-two" },
      audience: {
        recall: { kind: "persona", personaId: "example-two" },
        disclosure: { kind: "same-as-recall" },
      },
      content: "Candidate memory.",
      provenance: {
        source: "inferred",
        evidence: [{ kind: "tool", id: "test" }],
      },
      lifecycle: { status: "candidate", supersedes: [] },
      createdAt: now,
      updatedAt: now,
    })

    const accepted = acceptAgentMemoryCandidate(
      "owner",
      "example-two",
      recordId,
    )
    expect(accepted.memory.accepted).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: recordId })]),
    )

    const corrected = correctAgentMemoryRecord("owner", {
      personaId: "example-two",
      recordId,
      content: "Corrected memory.",
    })
    expect(corrected.memory.accepted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "Corrected memory." }),
      ]),
    )

    const replacement = corrected.memory.accepted.find(
      (record) => record.content === "Corrected memory.",
    )
    expect(replacement).toBeDefined()
    const archived = archiveAgentMemoryRecord(
      "owner",
      "example-two",
      replacement!.id,
    )
    expect(
      archived.memory.accepted.some((record) => record.id === replacement!.id),
    ).toBe(false)
  })
})
