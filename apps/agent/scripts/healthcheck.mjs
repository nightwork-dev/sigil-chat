import { pathToFileURL } from "node:url"
import {
  hasCodexAccessToken,
  hasCodexModelAuth,
} from "../agent/lib/model-auth.mjs"

export { hasCodexAccessToken } from "../agent/lib/model-auth.mjs"

export async function readAgentReadiness(options = {}) {
  if (!(await hasCodexModelAuth(options))) {
    return {
      status: "unavailable",
      checks: {
        codexModelAuth: "error",
        eveRuntime: "unknown",
      },
      diagnostic:
        "Codex model auth is unavailable. Run codex login --device-auth inside the Eve container as the runtime user.",
    }
  }

  const fetcher = options.fetcher ?? fetch
  const port = options.port ?? process.env.PORT ?? "3001"
  try {
    const response = await fetcher(`http://127.0.0.1:${port}/eve/v1/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      return {
        status: "unavailable",
        checks: {
          codexModelAuth: "ok",
          eveRuntime: "error",
        },
        diagnostic: `Eve runtime health returned HTTP ${response.status}. Check the Eve process logs.`,
      }
    }
  } catch {
    return {
      status: "unavailable",
      checks: {
        codexModelAuth: "ok",
        eveRuntime: "error",
      },
      diagnostic: `Eve runtime health did not respond on 127.0.0.1:${port}. Check the Eve process and PORT.`,
    }
  }

  return {
    status: "ready",
    checks: {
      codexModelAuth: "ok",
      eveRuntime: "ok",
    },
  }
}

export async function checkAgentReadiness(options = {}) {
  return (await readAgentReadiness(options)).status === "ready"
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const readiness = await readAgentReadiness()
  process.stdout.write(`${JSON.stringify(readiness)}\n`)
  process.exitCode = readiness.status === "ready" ? 0 : 1
}
