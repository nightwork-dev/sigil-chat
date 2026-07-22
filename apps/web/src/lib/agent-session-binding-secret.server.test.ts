import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { readAgentSessionBindingSecret } from "./agent-session-binding-secret.server"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("readAgentSessionBindingSecret", () => {
  it("reads the file-mounted production secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "sigil-binding-secret-"))
    temporaryDirectories.push(directory)
    const secretFile = join(directory, "gonk-mcp-key")
    writeFileSync(secretFile, "production-secret\n", { mode: 0o600 })

    expect(
      readAgentSessionBindingSecret({ GONK_MCP_KEY_FILE: secretFile }),
    ).toBe("production-secret")
  })

  it("prefers the inline secret when both forms are configured", () => {
    expect(
      readAgentSessionBindingSecret({
        GONK_MCP_KEY: "inline-secret",
        GONK_MCP_KEY_FILE: "/not/read/when/inline/is/present",
      }),
    ).toBe("inline-secret")
  })

  it("fails closed when the secret is unavailable", () => {
    expect(() => readAgentSessionBindingSecret({})).toThrow(
      "Agent session binding is unavailable.",
    )
  })
})
