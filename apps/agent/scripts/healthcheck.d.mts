export interface AgentReadinessOptions {
  codexHome?: string
  port?: string
  read?: (path: string, encoding: "utf8") => Promise<string>
  fetcher?: typeof fetch
}

export function hasCodexAccessToken(raw: string): boolean
export function checkAgentReadiness(
  options?: AgentReadinessOptions,
): Promise<boolean>
