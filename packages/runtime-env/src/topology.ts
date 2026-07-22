export const DEFAULT_EVE_ORIGIN = "http://sigil-chat-agent.localhost:1355";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type RuntimeEnvironmentErrorCode =
  | "INVALID_HTTP_URL"
  | "INVALID_EMBEDDING_DIM"
  | "INVALID_PATH_BASE"
  | "INVALID_PORT"
  | "INVALID_SECRET"
  | "INVALID_STORAGE_PATH";

export class RuntimeEnvironmentError extends Error {
  override readonly name = "RuntimeEnvironmentError";
  readonly code: RuntimeEnvironmentErrorCode;
  readonly variable: string;
  readonly detail: string;

  constructor(
    code: RuntimeEnvironmentErrorCode,
    variable: string,
    detail: string,
  ) {
    super(`${variable}: ${detail}`);
    this.code = code;
    this.variable = variable;
    this.detail = detail;
  }
}

export interface SigilRuntimeTopology {
  eveOrigin: string;
}

export interface PublicWebEnvironment {
  apiBaseUrl: string | undefined;
  pagesBase: string;
}

export function readRuntimeTopology(
  env: RuntimeEnvironment,
): SigilRuntimeTopology {
  return {
    eveOrigin: parseHttpUrl(
      env.EVE_ORIGIN,
      portlessSiblingUrl(env.PORTLESS_URL, "sigil-chat-agent") ??
        DEFAULT_EVE_ORIGIN,
      "EVE_ORIGIN",
    ),
  };
}

/** Resolve another Sigil service inside the same Portless worktree namespace.
 * Explicit EVE_ORIGIN values still win in readRuntimeTopology. */
export function portlessSiblingUrl(
  currentUrl: string | undefined,
  targetService: string,
  pathname = "",
): string | undefined {
  if (!currentUrl?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  const labels = parsed.hostname.split(".");
  const serviceIndex = labels.findIndex((label) =>
    ["sigil-chat", "sigil-chat-agent"].includes(label),
  );
  if (serviceIndex < 0) return undefined;
  labels[serviceIndex] = targetService;
  parsed.hostname = labels.join(".");
  parsed.pathname = pathname || "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

export function readPublicWebEnvironment(
  env: RuntimeEnvironment,
): PublicWebEnvironment {
  return {
    apiBaseUrl:
      env.VITE_API_BASE_URL === undefined
        ? undefined
        : parseHttpUrl(
            env.VITE_API_BASE_URL,
            "http://localhost:8787",
            "VITE_API_BASE_URL",
          ),
    pagesBase: parsePathBase(env.PAGES_BASE, "/", "PAGES_BASE"),
  };
}

export function parseHttpUrl(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const candidate = value === undefined ? fallback : value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw invalidHttpUrl(name);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidHttpUrl(name);
  }
  return parsed.href.replace(/\/+$/, "");
}

export function parsePathBase(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const candidate = value === undefined ? fallback : value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    throw new RuntimeEnvironmentError(
      "INVALID_PATH_BASE",
      name,
      "must be a slash-prefixed deployment path without a query or fragment",
    );
  }
  return candidate === "/" ? "/" : `${candidate.replace(/\/+$/, "")}/`;
}

export function joinRuntimeUrl(origin: string, path: string): string {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(path, base).href;
}

function invalidHttpUrl(name: string): RuntimeEnvironmentError {
  return new RuntimeEnvironmentError(
    "INVALID_HTTP_URL",
    name,
    "must be an absolute http(s) URL",
  );
}
