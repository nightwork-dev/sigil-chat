import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export interface ServiceStatus {
  id: "web" | "eve" | "gonk";
  label: string;
  status: "healthy" | "unhealthy";
  latencyMs: number;
}

export interface SystemStatus {
  checkedAt: string;
  services: readonly ServiceStatus[];
  usage: { status: "unavailable" };
}

export const fetchSystemStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemStatus> =>
    (await import("./system-status.server")).readSystemStatus(),
);

export async function measureService(
  id: ServiceStatus["id"],
  label: string,
  operation: () => Promise<void>,
  now: () => number = () => performance.now(),
): Promise<ServiceStatus> {
  const startedAt = now();
  try {
    await operation();
    return {
      id,
      label,
      status: "healthy",
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    };
  } catch {
    return {
      id,
      label,
      status: "unhealthy",
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    };
  }
}

export const systemStatusKeys = {
  all: () => ["system-status"] as const,
};

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: systemStatusKeys.all(),
    queryFn: () => fetchSystemStatus(),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useSystemStatus() {
  return useQuery(systemStatusQueryOptions());
}
