import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

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

export async function checkAgentReadiness(options = {}) {
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex")
  const read = options.read ?? readFile
  const fetcher = options.fetcher ?? fetch
  const port = options.port ?? process.env.PORT ?? "3001"

  let raw
  try {
    raw = await read(join(codexHome, "auth.json"), "utf8")
  } catch {
    return false
  }
  if (!hasCodexAccessToken(raw)) return false

  try {
    const response = await fetcher(`http://127.0.0.1:${port}/eve/v1/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = (await checkAgentReadiness()) ? 0 : 1
}
