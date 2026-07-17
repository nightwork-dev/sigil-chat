import { useQuery } from "@tanstack/react-query";
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

export interface AgentCatalog {
  agent: {
    name: string;
    model?: string;
  };
  skills: readonly AgentSkillCatalogItem[];
  subagents: readonly AgentSubagentCatalogItem[];
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
  skills?: {
    static?: unknown;
    dynamic?: unknown;
  };
  subagents?: {
    local?: unknown;
  };
  diagnostics?: {
    discoveryErrors?: unknown;
    discoveryWarnings?: unknown;
  };
}

const fetchAgentCatalogFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentCatalog> => {
    const origin =
      process.env.EVE_ORIGIN ?? "http://sigil-chat-agent.localhost:1355";
    const response = await fetch(
      new URL("/eve/v1/info", origin.endsWith("/") ? origin : `${origin}/`),
      {
        headers: { accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Eve agent inspection failed (${response.status} ${response.statusText})`,
      );
    }

    return projectAgentCatalog((await response.json()) as EveAgentInfo);
  },
);

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

export function projectAgentCatalog(info: EveAgentInfo): AgentCatalog {
  return {
    agent: {
      name: stringValue(info.agent?.name, "Embedded agent"),
      model:
        typeof info.agent?.model?.id === "string"
          ? info.agent.model.id
          : undefined,
    },
    skills: projectSkills(info.skills),
    subagents: projectSubagents(info.subagents),
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
};

export function useAgentCatalog() {
  return useQuery({
    queryKey: agentCatalogKeys.info(),
    queryFn: () => fetchAgentCatalogFn(),
    staleTime: 5_000,
    retry: false,
  });
}
