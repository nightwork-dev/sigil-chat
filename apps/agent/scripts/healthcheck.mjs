import { pathToFileURL } from "node:url"
import {
  hasCodexAccessToken,
  hasCodexModelAuth,
} from "../agent/lib/model-auth.mjs"

export { hasCodexAccessToken } from "../agent/lib/model-auth.mjs"

export async function checkAgentReadiness(options = {}) {
  const fetcher = options.fetcher ?? fetch
  const port = options.port ?? process.env.PORT ?? "3001"
  if (!(await hasCodexModelAuth(options))) return false

  try {
    const response = await fetcher(`http://127.0.0.1:${port}/eve/v1/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = (await checkAgentReadiness()) ? 0 : 1
}
