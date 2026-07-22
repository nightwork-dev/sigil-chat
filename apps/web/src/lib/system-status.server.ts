import { getAuthDbClient, type SigilAuthSession } from "./auth/server"
import { getEveBearerToken, getSession, requireOwner } from "./auth/session"
import { checkWebHealth } from "./health.server"
import {
  ServiceDiagnosticError,
  measureService,
  type SystemStatus,
} from "./system-status"
import { readGonkClientEnvironment } from "@workspace/runtime-env/server"
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
    gonkApiKey: string | undefined
    gonkMcpUrl: string
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
    }),
    measureService("gonk", "Application tools and artifact store", async () => {
      if (!environment.gonkApiKey)
        throw new ServiceDiagnosticError(
          "GONK_MCP_KEY is unavailable to the web server. Check the mounted service secret.",
        )
      const url = new URL("/health", environment.gonkMcpUrl)
      let response: Response
      try {
        response = await dependencies.fetcher(url, {
          headers: { authorization: `Bearer ${environment.gonkApiKey}` },
          signal: AbortSignal.timeout(5_000),
        })
      } catch {
        throw new ServiceDiagnosticError(
          "Gonk readiness did not respond. Check the Gonk container and internal MCP URL.",
        )
      }
      if (!response.ok) {
        throw new ServiceDiagnosticError(
          `Gonk readiness returned HTTP ${response.status}. Check Gonk artifact-store logs and the service bearer.`,
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
      const gonk = readGonkClientEnvironment(process.env)
      return {
        eveOrigin: topology.eveOrigin,
        gonkApiKey: gonk.apiKey,
        gonkMcpUrl: gonk.gonkMcpUrl,
      }
    },
  }
}
