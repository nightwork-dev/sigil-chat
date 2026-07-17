export const DEFAULT_EVE_ORIGIN = "http://sigil-chat-agent.localhost:1355";
export const DEFAULT_GONK_MCP_URL = "http://sigil-chat-gonk.localhost:1355/mcp";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface SigilRuntimeTopology {
  eveOrigin: string;
  gonkMcpUrl: string;
}

export function readRuntimeTopology(
  env: RuntimeEnvironment,
): SigilRuntimeTopology {
  return {
    eveOrigin: parseHttpUrl(env.EVE_ORIGIN, DEFAULT_EVE_ORIGIN, "EVE_ORIGIN"),
    gonkMcpUrl: parseHttpUrl(
      env.GONK_MCP_URL,
      DEFAULT_GONK_MCP_URL,
      "GONK_MCP_URL",
    ),
  };
}

export function parseHttpUrl(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const candidate = value?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  return parsed.href.replace(/\/$/, "");
}

export function joinRuntimeUrl(origin: string, path: string): string {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(path, base).href;
}
