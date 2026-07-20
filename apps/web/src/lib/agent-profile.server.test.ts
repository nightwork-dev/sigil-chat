import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const originalPersonaDir = process.env.SIGIL_PERSONA_DIR
const originalMemoryDir = process.env.SIGIL_MEMORY_DIR
const fixtureRoot = mkdtempSync(join(tmpdir(), "sigil-agent-profile-"))
const personaDir = join(fixtureRoot, "personas")
const memoryDir = join(fixtureRoot, "memory")

function writePersona(id: string, name: string, description: string, systemPrompt: string) {
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
    const { listAgentPersonas, loadAgentProfile } = await import("./agent-profile.server")

    expect(listAgentPersonas()).toEqual([
      { id: "example-one", name: "One", description: "First persona" },
      { id: "example-two", name: "Two", description: "Second persona" },
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
    expect(() => loadAgentProfile("owner", "missing-persona")).toThrow("persona missing-persona not found")
  })
})
