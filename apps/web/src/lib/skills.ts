import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  ManagedSkillDetail,
  ManagedSkillSummary,
  SkillArchiveResult,
  SkillGetResult,
  SkillListResult,
  SkillMutationResult,
  SkillScope,
} from "@gonk/skills";

export type SkillListInput = {
  scope?: SkillScope;
  includeFreshness?: boolean;
};

export type SkillGetInput = {
  id: string;
  scope?: SkillScope;
  includeFreshness?: boolean;
};

export type SkillUpsertInput = {
  id: string;
  scope: SkillScope;
  body: string;
  description?: string;
  expectedRevision?: string;
  idempotencyKey?: string;
};

export type SkillDeleteInput = {
  id: string;
  expectedRevision: string;
  scope?: SkillScope;
  idempotencyKey?: string;
};

export type SkillCatalog = SkillListResult;
export type SkillDetail = SkillGetResult;
export type SkillClientCommand = {
  type: "agent.domain.outcome";
  payload: {
    id: string;
    kind: "skills.changed";
    resource: { kind: "skills-catalog"; id: string };
    operation: string;
    changedIds: readonly string[];
  };
};
export type SkillChangeResult =
  | (SkillMutationResult & { clientCommand?: SkillClientCommand })
  | (SkillArchiveResult & { clientCommand?: SkillClientCommand });

const listSkillsFn = createServerFn({ method: "GET" })
  .validator((input: SkillListInput) => input)
  .handler(
    async ({ data }): Promise<SkillCatalog> =>
      invokeGonkTool<SkillCatalog>("sigil-skill-list", data),
  );

const getSkillFn = createServerFn({ method: "GET" })
  .validator((input: SkillGetInput) => input)
  .handler(
    async ({ data }): Promise<SkillDetail> =>
      invokeGonkTool<SkillDetail>("sigil-skill-get", data),
  );

const upsertSkillFn = createServerFn({ method: "POST" })
  .validator((input: SkillUpsertInput) => input)
  .handler(
    async ({ data }): Promise<SkillChangeResult> =>
      invokeGonkTool<SkillChangeResult>("sigil-skill-upsert", data),
  );

const deleteSkillFn = createServerFn({ method: "POST" })
  .validator((input: SkillDeleteInput) => input)
  .handler(
    async ({ data }): Promise<SkillChangeResult> =>
      invokeGonkTool<SkillChangeResult>("sigil-skill-delete", data),
  );

export const skillKeys = {
  all: () => ["skills"] as const,
  list: (input: SkillListInput = {}) =>
    [...skillKeys.all(), "list", input] as const,
  detail: (input: SkillGetInput) =>
    [...skillKeys.all(), "detail", input] as const,
};

export function useSkills(input: SkillListInput = {}) {
  return useQuery({
    queryKey: skillKeys.list(input),
    queryFn: () => listSkillsFn({ data: input }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useSkill(
  id: string | undefined,
  options: Omit<SkillGetInput, "id"> = {},
) {
  const input = { id: id ?? "", ...options };
  return useQuery({
    queryKey: skillKeys.detail(input),
    queryFn: () => getSkillFn({ data: input }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useUpsertSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillUpsertInput) => upsertSkillFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.all() }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillDeleteInput) => deleteSkillFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.all() }),
  });
}

async function invokeGonkTool<T>(
  name: string,
  input: Record<string, unknown>,
): Promise<T> {
  const { readGonkClientEnvironment } =
    await import("@workspace/runtime-env/server");
  const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
  if (!apiKey) {
    throw new Error(
      "GONK_MCP_KEY is not configured for the web app's server process; skill operations cannot be authenticated against Gonk.",
    );
  }

  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  const initialized = await fetch(gonkMcpUrl, {
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
      `Gonk skill initialization failed (${initialized.status} ${initialized.statusText})`,
    );
  }

  const sessionId = initialized.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("Gonk did not return an MCP session id.");
  const sessionHeaders = { ...headers, "mcp-session-id": sessionId };

  try {
    const notification = await fetch(gonkMcpUrl, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
    if (!notification.ok && notification.status !== 202) {
      throw new Error(
        `Gonk skill session initialization failed (${notification.status} ${notification.statusText})`,
      );
    }

    const response = await fetch(gonkMcpUrl, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: input },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Gonk skill call failed (${response.status} ${response.statusText})`,
      );
    }
    return readGonkToolResult<T>(await response.json());
  } finally {
    await fetch(gonkMcpUrl, {
      method: "DELETE",
      headers: sessionHeaders,
    }).catch(() => undefined);
  }
}

function readGonkToolResult<T>(value: unknown): T {
  if (!isRecord(value))
    throw new Error("Gonk returned an invalid MCP response.");
  if (isRecord(value.error)) {
    throw new Error(readErrorMessage(value.error));
  }
  if (!isRecord(value.result)) {
    throw new Error("Gonk returned an MCP response without a result.");
  }
  const result = value.result;
  if (result.isError === true) throw new Error(readErrorMessage(result));
  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }

  const text = Array.isArray(result.content)
    ? result.content.find(
        (item): item is { type: "text"; text: string } =>
          isRecord(item) &&
          item.type === "text" &&
          typeof item.text === "string",
      )?.text
    : undefined;
  if (text === undefined)
    throw new Error("Gonk returned no structured tool data.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}

function readErrorMessage(value: Record<string, unknown>): string {
  if (typeof value.message === "string") return value.message;
  if (
    isRecord(value.structuredContent) &&
    isRecord(value.structuredContent.error)
  ) {
    const message = value.structuredContent.error.message;
    if (typeof message === "string") return message;
  }
  return "Gonk skill operation failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type { ManagedSkillDetail, ManagedSkillSummary };
