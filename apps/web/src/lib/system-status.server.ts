import { getAuthDbClient, type SigilAuthSession } from "./auth/server"
import { getEveBearerToken, getSession, requireOwner } from "./auth/session"
import { checkWebHealth } from "./health.server"
import { measureService, type SystemStatus } from "./system-status"
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
    measureService("web", "Web and account store", dependencies.checkWeb),
    measureService("eve", "Agent runtime and model access", async () => {
      const response = await dependencies.fetcher(
        joinRuntimeUrl(environment.eveOrigin, "/sigil/v1/readiness"),
        {
          headers: { authorization: `Bearer ${eveToken}` },
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (!response.ok) throw new Error("Agent runtime is unavailable")
    }),
    measureService("gonk", "Application tools and artifact store", async () => {
      if (!environment.gonkApiKey)
        throw new Error("Tool service is unavailable")
      const response = await dependencies.fetcher(
        new URL("/health", environment.gonkMcpUrl),
        {
          headers: { authorization: `Bearer ${environment.gonkApiKey}` },
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (!response.ok) throw new Error("Tool service is unavailable")
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
