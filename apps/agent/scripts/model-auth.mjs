import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export function hasCodexAccessToken(raw) {
  try {
    const auth = JSON.parse(raw)
    return (
      typeof auth?.tokens?.access_token === "string" &&
      auth.tokens.access_token.trim().length > 0
    )
  } catch {
    return false
  }
}

export async function hasCodexModelAuth(options = {}) {
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex")
  const read = options.read ?? readFile
  try {
    return hasCodexAccessToken(await read(join(codexHome, "auth.json"), "utf8"))
  } catch {
    return false
  }
}
