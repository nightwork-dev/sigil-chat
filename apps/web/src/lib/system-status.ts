import { queryOptions, useQuery } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import type { SigilAuthSession } from "./auth/server"

export interface ServiceStatus {
  id: "web" | "eve" | "gonk"
  label: string
  status: "healthy" | "unhealthy"
  latencyMs: number
}

export interface SystemStatus {
  checkedAt: string
  services: readonly ServiceStatus[]
  usage: { status: "unavailable" }
}

export const fetchSystemStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemStatus> => {
    const { getSession, requireOwner, getEveBearerToken } = await import(
      "./auth/session"
    )
    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)

    const [{ checkWebHealth }, { getAuthDbClient }, runtime, topology] =
      await Promise.all([
        import("./health.server"),
        import("./auth/server"),
        import("@workspace/runtime-env/server"),
        import("@workspace/runtime-env/topology"),
      ])
    const runtimeTopology = topology.readRuntimeTopology(process.env)
    const gonkEnvironment = runtime.readGonkClientEnvironment(process.env)
    const eveToken = await getEveBearerToken()

    const services = await Promise.all([
      measureService("web", "Web and account store", async () => {
        await checkWebHealth(await getAuthDbClient())
      }),
      measureService("eve", "Agent runtime", async () => {
        const response = await fetch(
          topology.joinRuntimeUrl(runtimeTopology.eveOrigin, "/eve/v1/info"),
          {
            headers: { authorization: `Bearer ${eveToken}` },
            signal: AbortSignal.timeout(5_000),
          },
        )
        if (!response.ok) throw new Error("Agent runtime is unavailable")
      }),
      measureService("gonk", "Application tools and artifact store", async () => {
        if (!gonkEnvironment.apiKey) throw new Error("Tool service is unavailable")
        const response = await fetch(new URL("/health", gonkEnvironment.gonkMcpUrl), {
          headers: { authorization: `Bearer ${gonkEnvironment.apiKey}` },
          signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok) throw new Error("Tool service is unavailable")
      }),
    ])

    return {
      checkedAt: new Date().toISOString(),
      services,
      usage: { status: "unavailable" },
    }
  },
)

export async function measureService(
  id: ServiceStatus["id"],
  label: string,
  operation: () => Promise<void>,
  now: () => number = () => performance.now(),
): Promise<ServiceStatus> {
  const startedAt = now()
  try {
    await operation()
    return {
      id,
      label,
      status: "healthy",
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    }
  } catch {
    return {
      id,
      label,
      status: "unhealthy",
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    }
  }
}

export const systemStatusKeys = {
  all: () => ["system-status"] as const,
}

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: systemStatusKeys.all(),
    queryFn: () => fetchSystemStatus(),
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useSystemStatus() {
  return useQuery(systemStatusQueryOptions())
}
