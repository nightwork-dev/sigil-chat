import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export type AgentCatalogOrigin = "host-authored" | "host-declared";
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
  origin: "application";
  availability: "available";
  runtimeStatus: "callable";
}

export interface AgentRuntimeToolCatalogItem {
  id: string;
  name: string;
  description: string;
  origin: "host-framework" | "host-authored";
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
    source: "agent-inspection";
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

  return fetchAgentRuntimeCatalogFromHost(
    joinRuntimeUrl(origin, "/eve/v1/info"),
    await getEveBearerToken(),
  );
}

const fetchAgentRuntimeCatalogFn = createServerFn({ method: "GET" }).handler(
  loadAgentRuntimeCatalog,
);

const fetchAgentCatalogFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentCatalog> => {
    const { joinRuntimeUrl, readRuntimeTopology } =
      await import("@workspace/runtime-env/topology");
    const { getEveBearerToken } = await import("./auth/session");
    const origin = readRuntimeTopology(process.env).eveOrigin;
    const bearer = await getEveBearerToken();
    const [catalog, tools] = await Promise.all([
      fetchAgentRuntimeCatalogFromHost(
        joinRuntimeUrl(origin, "/eve/v1/info"),
        bearer,
      ),
      fetchApplicationToolCatalog(
        joinRuntimeUrl(origin, "/sigil/v1/application-tools"),
        bearer,
      ),
    ]);
    return { ...catalog, tools };
  },
);

interface ApplicationToolInfo {
  name?: unknown;
  description?: unknown;
}

export async function fetchApplicationToolCatalog(
  url: string,
  bearer: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentToolCatalogItem[]> {
  const response = await fetcher(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Application tool catalog failed (${response.status} ${response.statusText})`,
    );
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The agent returned an invalid application tool catalog.");
  }
  const tools = (payload as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) {
    throw new Error("The agent returned an invalid application tool list.");
  }
  return tools.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const tool = candidate as ApplicationToolInfo;
    const name = stringValue(tool.name, "");
    if (!name) return [];
    return [
      {
        id: name,
        name,
        description: stringValue(tool.description, "Application tool"),
        origin: "application" as const,
        availability: "available" as const,
        runtimeStatus: "callable" as const,
      },
    ];
  });
}

export async function fetchAgentRuntimeCatalogFromHost(
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
      `Agent runtime inspection failed (${response.status} ${response.statusText})`,
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
        origin: "host-authored",
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
        origin: "host-declared",
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
    const origin =
      tool.origin === "authored" ? "host-authored" : "host-framework";
    return {
      id: `runtime__${name || `runtime-tool-${index + 1}`}`,
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
      source: "agent-inspection",
      lifecycle: "unavailable",
      explanation:
        "This catalog reflects the active agent runtime. Creating, editing, pinning, staging, and archiving remain unavailable until the managed skill lifecycle is enabled.",
    },
    diagnostics: {
      errors: countValue(info.diagnostics?.discoveryErrors),
      warnings: countValue(info.diagnostics?.discoveryWarnings),
    },
  };
}

export const agentCatalogKeys = {
  all: () => ["agent-catalog"] as const,
  info: () => ["agent-catalog", "runtime-info"] as const,
  full: () => ["agent-catalog", "runtime-and-application-tools"] as const,
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
