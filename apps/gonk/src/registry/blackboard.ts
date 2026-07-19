import {
  shape,
  type ToolContext,
  type ToolRegistry,
} from "@gonk/tool-registry";
import {
  blackboardRepository,
  type BlackboardRepository,
} from "@workspace/blackboard-store";

import {
  normalizeScope,
  type ScopeInput,
  type ResourceScope,
} from "../artifact-scope.js";
import { emptyObjectSchema, readHints, writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord, isEmptyObject } from "./validators.js";

interface BlackboardWriteInput {
  content: string;
}

export function registerBlackboardTools(
  registry: ToolRegistry,
  repository: BlackboardRepository = blackboardRepository,
): void {
  registry.register({
    name: "sigil-blackboard-read",
    description: "Read the shared markdown blackboard for the current session.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object; the session comes from the request scope.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async (_input, ctx) => ({
      data: await repository.read(requireSessionId(ctx)),
    }),
  });

  registry.register({
    name: "sigil-blackboard-write",
    description:
      "Replace the shared markdown blackboard for the current session. Use an empty content string to clear it.",
    visibility: "always",
    approval: "write",
    input: shape<BlackboardWriteInput>(
      isBlackboardWriteInput,
      "Expected a markdown `content` string; the session comes from the request scope.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => ({
      data: await repository.write(
        requireSessionId(ctx),
        input.content,
        ctx.auth?.principal?.id ?? "agent",
      ),
    }),
  });
}

function isBlackboardWriteInput(value: unknown): value is BlackboardWriteInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["content"]) &&
    typeof value.content === "string"
  );
}

function requireSessionId(ctx: ToolContext): string {
  const scope = requestScope(ctx);
  if (!scope || scope.tier !== "session") {
    throw new Error(
      "Blackboard tools require a session request scope; project and persona scopes are not supported.",
    );
  }
  return scope.id;
}

function requestScope(ctx: ToolContext): ResourceScope | undefined {
  if (!isRecord(ctx.host)) return undefined;
  return (
    normalizeScope(ctx.host.resourceScope as ScopeInput | undefined) ??
    normalizeScope(ctx.host.sessionScope as string | undefined)
  );
}
