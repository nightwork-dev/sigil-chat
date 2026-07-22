export interface AgentReadinessOptions {
  codexHome?: string
  port?: string
  read?: (path: string, encoding: "utf8") => Promise<string>
  fetcher?: typeof fetch
}

export function hasCodexAccessToken(raw: string): boolean
export function readAgentReadiness(options?: AgentReadinessOptions): Promise<
  | {
      status: "ready"
      checks: { codexModelAuth: "ok"; eveRuntime: "ok" }
    }
  | {
      status: "unavailable"
      checks:
        | { codexModelAuth: "error"; eveRuntime: "unknown" }
        | { codexModelAuth: "ok"; eveRuntime: "error" }
      diagnostic: string
    }
>
export function checkAgentReadiness(
  options?: AgentReadinessOptions,
): Promise<boolean>
