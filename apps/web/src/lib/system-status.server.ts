import { getAuthDbClient, type SigilAuthSession } from "./auth/server"
import { getEveBearerToken, getSession, requireOwner } from "./auth/session"
import { checkWebHealth } from "./health.server"
import {
  ServiceDiagnosticError,
  measureService,
  type SystemStatus,
} from "./system-status"
import {
  joinRuntimeUrl,
  readRuntimeTopology,
} from "@workspace/runtime-env/topology"

export interface SystemStatusDependencies {
  checkWeb: () => Promise<void>
  fetcher: typeof fetch
  getEveToken: () => Promise<string>
  getSession: () => Promise<SigilAuthSession | null>
  now: () => Date
  readEnvironment: () => {
    eveOrigin: string
  }
}

export async function readSystemStatus(
  dependencies: SystemStatusDependencies = defaultDependencies(),
): Promise<SystemStatus> {
  const session = await dependencies.getSession()
  requireOwner(session)

  const environment = dependencies.readEnvironment()
  const eveToken = await dependencies.getEveToken()
  const services = await Promise.all([
    measureService("web", "Web and account store", async () => {
      try {
        await dependencies.checkWeb()
      } catch {
        throw new ServiceDiagnosticError(
          "Account-store write/read probe failed. Run the web migrations and inspect web logs.",
        )
      }
    }),
    measureService("eve", "Agent runtime and model access", async () => {
      const url = joinRuntimeUrl(environment.eveOrigin, "/sigil/v1/readiness")
      let response: Response
      try {
        response = await dependencies.fetcher(url, {
          headers: { authorization: `Bearer ${eveToken}` },
          signal: AbortSignal.timeout(5_000),
        })
      } catch {
        throw new ServiceDiagnosticError(
          "Eve readiness did not respond. Check the Eve container and internal service URL.",
        )
      }
      if (!response.ok) {
        throw new ServiceDiagnosticError(
          `Eve readiness returned HTTP ${response.status}. Run the model-aware Eve healthcheck inside the container.`,
        )
      }
      const readiness: unknown = await response.json()
      if (!hasReadyApplicationTools(readiness)) {
        throw new ServiceDiagnosticError(
          "Eve is reachable, but its native application tools are unavailable. Check the agent build and logs.",
        )
      }
    }),
  ])

  return {
    checkedAt: dependencies.now().toISOString(),
    services,
    usage: { status: "unavailable" },
  }
}

function defaultDependencies(): SystemStatusDependencies {
  return {
    checkWeb: async () => checkWebHealth(await getAuthDbClient()),
    fetcher: fetch,
    getEveToken: getEveBearerToken,
    getSession,
    now: () => new Date(),
    readEnvironment: () => {
      const topology = readRuntimeTopology(process.env)
      return {
        eveOrigin: topology.eveOrigin,
      }
    },
  }
}

function hasReadyApplicationTools(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false
  const tools = (value as { applicationTools?: unknown }).applicationTools
  if (typeof tools !== "object" || tools === null) return false
  const state = tools as { count?: unknown; status?: unknown }
  return (
    state.status === "ready" &&
    typeof state.count === "number" &&
    Number.isInteger(state.count) &&
    state.count > 0
  )
}
