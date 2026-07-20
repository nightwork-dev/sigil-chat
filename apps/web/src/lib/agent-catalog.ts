import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export type AgentCatalogOrigin = "eve-authored" | "eve-declared";
export type AgentCatalogCapability = "read" | "delegate";

export interface AgentSkillCatalogItem {
  id: string;
  name: string;
  description: string;
  origin: AgentCatalogOrigin;
  availability: "available";
  capabilities: readonly AgentCatalogCapability[];
  runtimeStatus: "model-discoverable";
  sourcePath?: string;
}

export interface AgentSubagentCatalogItem {
  id: string;
  name: string;
  description: string;
  origin: AgentCatalogOrigin;
  availability: "available";
  capabilities: readonly AgentCatalogCapability[];
  runtimeStatus: "delegatable";
  sourcePath?: string;
  summary: {
    instructions: boolean;
    skills: number;
    tools: number;
    connections: number;
  };
}

export interface AgentToolCatalogItem {
  id: string;
  name: string;
  description: string;
  origin: "gonk";
  availability: "available";
  runtimeStatus: "callable";
}

export interface AgentRuntimeToolCatalogItem {
  id: string;
  name: string;
  description: string;
  origin: "eve-framework" | "eve-authored";
  availability: "available";
  runtimeStatus: "callable" | "discoverable";
  requiresApproval: boolean;
}

export interface AgentConnectionCatalogItem {
  id: string;
  name: string;
  description: string;
  protocol: string;
}

export interface AgentCatalog {
  agent: {
    name: string;
    model?: string;
    instructions: {
      loaded: boolean;
      name?: string;
      lines: number;
      dynamicResolvers: number;
    };
  };
  connections: readonly AgentConnectionCatalogItem[];
  skills: readonly AgentSkillCatalogItem[];
  subagents: readonly AgentSubagentCatalogItem[];
  runtimeTools: readonly AgentRuntimeToolCatalogItem[];
  tools: readonly AgentToolCatalogItem[];
  management: {
    source: "eve-inspection";
    lifecycle: "unavailable";
    explanation: string;
  };
  diagnostics: {
    errors: number;
    warnings: number;
  };
}

interface EveSkillInfo {
  name?: unknown;
  description?: unknown;
  logicalPath?: unknown;
  sourceId?: unknown;
}

interface EveSubagentInfo {
  name?: unknown;
  description?: unknown;
  logicalPath?: unknown;
  sourceId?: unknown;
  summary?: {
    instructions?: unknown;
    skills?: unknown;
    tools?: unknown;
    connections?: unknown;
  };
}

interface EveAgentInfo {
  agent?: {
    name?: unknown;
    model?: {
      id?: unknown;
    };
  };
  connections?: unknown;
  instructions?: {
    static?: unknown;
    dynamic?: unknown;
  };
  skills?: {
    static?: unknown;
    dynamic?: unknown;
  };
  subagents?: {
    local?: unknown;
  };
  tools?: {
    available?: unknown;
    dynamic?: unknown;
  };
  diagnostics?: {
    discoveryErrors?: unknown;
    discoveryWarnings?: unknown;
  };
}

interface EveConnectionInfo {
  connectionName?: unknown;
  description?: unknown;
  protocol?: unknown;
}

interface EveToolInfo {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  origin?: unknown;
  requiresApproval?: unknown;
}

interface EveInstructionsInfo {
  name?: unknown;
  markdown?: unknown;
}

async function loadAgentRuntimeCatalog(): Promise<AgentCatalog> {
  const { joinRuntimeUrl, readRuntimeTopology } =
    await import("@workspace/runtime-env/topology");
  const { getEveBearerToken } = await import("./auth/session");
  const origin = readRuntimeTopology(process.env).eveOrigin;

  return fetchAgentCatalogFromEve(
    joinRuntimeUrl(origin, "/eve/v1/info"),
    await getEveBearerToken(),
  );
}

const fetchAgentRuntimeCatalogFn = createServerFn({ method: "GET" }).handler(
  loadAgentRuntimeCatalog,
);

const fetchAgentCatalogFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentCatalog> => {
    const { readGonkClientEnvironment } =
      await import("@workspace/runtime-env/server");
    const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
    if (!apiKey) {
      throw new Error(
        "GONK_MCP_KEY is not configured for the web app's server process; the tool catalog cannot authenticate against Gonk.",
      );
    }
    const [catalog, tools] = await Promise.all([
      loadAgentRuntimeCatalog(),
      fetchGonkToolCatalog(gonkMcpUrl, apiKey),
    ]);
    return { ...catalog, tools };
  },
);

interface McpToolInfo {
  name?: unknown;
  description?: unknown;
}

export async function fetchGonkToolCatalog(
  url: string,
  bearer: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentToolCatalogItem[]> {
  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
  };
  const initialized = await fetcher(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "sigil-chat-web", version: "0.0.1" },
      },
    }),
  });
  if (!initialized.ok) {
    throw new Error(
      `Gonk tool catalog initialization failed (${initialized.status} ${initialized.statusText})`,
    );
  }
  const sessionId = initialized.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("Gonk did not return an MCP session id.");
  const sessionHeaders = { ...headers, "mcp-session-id": sessionId };

  try {
    const notification = await fetcher(url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
    if (!notification.ok && notification.status !== 202) {
      throw new Error(
        `Gonk tool catalog session initialization failed (${notification.status} ${notification.statusText})`,
      );
    }
    const response = await fetcher(url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Gonk tool catalog failed (${response.status} ${response.statusText})`,
      );
    }
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new Error("Gonk returned an invalid MCP tool catalog response.");
    }
    if (typeof (payload as { error?: unknown }).error === "object") {
      throw new Error("Gonk rejected the MCP tool catalog request.");
    }
    const result = (payload as { result?: unknown }).result;
    if (typeof result !== "object" || result === null) {
      throw new Error(
        "Gonk returned an MCP tool catalog response without a result.",
      );
    }
    const tools = (result as { tools?: unknown }).tools;
    if (!Array.isArray(tools)) {
      throw new Error("Gonk returned an invalid MCP tool list.");
    }
    return tools.flatMap((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const tool = candidate as McpToolInfo;
      const name = stringValue(tool.name, "");
      if (!name) return [];
      return [
        {
          id: `gonk__${name}`,
          name,
          description: stringValue(tool.description, "Application tool"),
          origin: "gonk" as const,
          availability: "available" as const,
          runtimeStatus: "callable" as const,
        },
      ];
    });
  } finally {
    await fetcher(url, { method: "DELETE", headers: sessionHeaders }).catch(
      () => undefined,
    );
  }
}

export async function fetchAgentCatalogFromEve(
  url: string,
  bearer: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentCatalog> {
  const response = await fetcher(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Eve agent inspection failed (${response.status} ${response.statusText})`,
    );
  }

  return projectAgentCatalog((await response.json()) as EveAgentInfo);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function lineCount(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return 0;
  const withoutTerminalNewline = value.replace(/\r?\n$/u, "");
  return withoutTerminalNewline.length === 0
    ? 0
    : withoutTerminalNewline.split(/\r?\n/u).length;
}

function projectConnections(
  value: EveAgentInfo["connections"],
): AgentConnectionCatalogItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const connection = candidate as EveConnectionInfo;
    const name = stringValue(
      connection.connectionName,
      `connection-${index + 1}`,
    );
    return [
      {
        id: name,
        name,
        description: stringValue(connection.description, "Agent connection"),
        protocol: stringValue(connection.protocol, "connection"),
      },
    ];
  });
}

function projectInstructions(
  value: EveAgentInfo["instructions"],
): AgentCatalog["agent"]["instructions"] {
  const staticInstructions =
    typeof value?.static === "object" && value.static !== null
      ? (value.static as EveInstructionsInfo)
      : null;
  const dynamicResolvers = Array.isArray(value?.dynamic)
    ? value.dynamic.length
    : 0;

  return {
    loaded: staticInstructions !== null,
    name:
      staticInstructions === null
        ? undefined
        : stringValue(staticInstructions.name, "Agent instructions"),
    lines: lineCount(staticInstructions?.markdown),
    dynamicResolvers,
  };
}

function safeLogicalPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    return undefined;
  }
  return normalized;
}

function projectSkills(value: EveAgentInfo["skills"]): AgentSkillCatalogItem[] {
  const staticSkills = Array.isArray(value?.static) ? value.static : [];
  const dynamicSkills = Array.isArray(value?.dynamic) ? value.dynamic : [];

  return [...staticSkills, ...dynamicSkills].flatMap((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const skill = candidate as EveSkillInfo;
    const id = stringValue(
      skill.name,
      stringValue(skill.sourceId, `authored-skill-${index + 1}`),
    );
    return [
      {
        id,
        name: id,
        description: stringValue(
          skill.description,
          "Authored procedure available to the root agent.",
        ),
        origin: "eve-authored",
        availability: "available",
        capabilities: ["read"],
        runtimeStatus: "model-discoverable",
        sourcePath: safeLogicalPath(skill.logicalPath),
      },
    ];
  });
}

function projectSubagents(
  value: EveAgentInfo["subagents"],
): AgentSubagentCatalogItem[] {
  const local = Array.isArray(value?.local) ? value.local : [];

  return local.flatMap((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const subagent = candidate as EveSubagentInfo;
    const id = stringValue(
      subagent.name,
      stringValue(subagent.sourceId, `declared-subagent-${index + 1}`),
    );
    return [
      {
        id,
        name: id,
        description: stringValue(
          subagent.description,
          "Declared specialist available for delegated work.",
        ),
        origin: "eve-declared",
        availability: "available",
        capabilities: ["read", "delegate"],
        runtimeStatus: "delegatable",
        sourcePath: safeLogicalPath(subagent.logicalPath),
        summary: {
          instructions: subagent.summary?.instructions === true,
          skills: countValue(subagent.summary?.skills),
          tools: countValue(subagent.summary?.tools),
          connections: countValue(subagent.summary?.connections),
        },
      },
    ];
  });
}

function projectRuntimeTools(
  value: EveAgentInfo["tools"],
): AgentRuntimeToolCatalogItem[] {
  const available = Array.isArray(value?.available) ? value.available : [];
  const dynamic = Array.isArray(value?.dynamic) ? value.dynamic : [];
  const known = new Set<string>();

  const project = (
    candidate: unknown,
    index: number,
    runtimeStatus: AgentRuntimeToolCatalogItem["runtimeStatus"],
  ): AgentRuntimeToolCatalogItem | null => {
    if (typeof candidate !== "object" || candidate === null) return null;
    const tool = candidate as EveToolInfo;
    const name = stringValue(tool.name, stringValue(tool.slug, ""));
    if (!name || known.has(name)) return null;
    known.add(name);
    const origin = tool.origin === "authored" ? "eve-authored" : "eve-framework";
    return {
      id: `eve__${name || `runtime-tool-${index + 1}`}`,
      name,
      description: stringValue(tool.description, "Runtime capability"),
      origin,
      availability: "available",
      runtimeStatus,
      requiresApproval: tool.requiresApproval === true,
    };
  };

  return [
    ...available.flatMap((candidate, index) => {
      const tool = project(candidate, index, "callable");
      return tool === null ? [] : [tool];
    }),
    ...dynamic.flatMap((candidate, index) => {
      const tool = project(candidate, available.length + index, "discoverable");
      return tool === null ? [] : [tool];
    }),
  ];
}

export function projectAgentCatalog(info: EveAgentInfo): AgentCatalog {
  return {
    agent: {
      name: stringValue(info.agent?.name, "Embedded agent"),
      model:
        typeof info.agent?.model?.id === "string"
          ? info.agent.model.id
          : undefined,
      instructions: projectInstructions(info.instructions),
    },
    connections: projectConnections(info.connections),
    skills: projectSkills(info.skills),
    subagents: projectSubagents(info.subagents),
    runtimeTools: projectRuntimeTools(info.tools),
    tools: [],
    management: {
      source: "eve-inspection",
      lifecycle: "unavailable",
      explanation:
        "This catalog reflects Eve-authored runtime capabilities. Creating, editing, pinning, staging, and archiving remain unavailable until Gonk Core publishes the managed SkillRegistry contract.",
    },
    diagnostics: {
      errors: countValue(info.diagnostics?.discoveryErrors),
      warnings: countValue(info.diagnostics?.discoveryWarnings),
    },
  };
}

export const agentCatalogKeys = {
  all: () => ["agent-catalog"] as const,
  info: () => ["agent-catalog", "eve-info"] as const,
  full: () => ["agent-catalog", "eve-info-and-gonk-tools"] as const,
};

export function agentRuntimeCatalogQueryOptions() {
  return queryOptions({
    queryKey: agentCatalogKeys.info(),
    queryFn: () => fetchAgentRuntimeCatalogFn(),
    staleTime: 5_000,
    retry: false,
  });
}

export function agentCatalogQueryOptions() {
  return queryOptions({
    queryKey: agentCatalogKeys.full(),
    queryFn: () => fetchAgentCatalogFn(),
    staleTime: 5_000,
    retry: false,
  });
}

export function useAgentRuntimeCatalog() {
  return useQuery(agentRuntimeCatalogQueryOptions());
}

export function useAgentCatalog() {
  return useQuery(agentCatalogQueryOptions());
}
