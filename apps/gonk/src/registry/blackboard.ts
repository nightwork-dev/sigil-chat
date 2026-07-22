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
  assertBlackboardContent,
  MAX_BLACKBOARD_CONTENT_CHARS,
} from "@workspace/blackboard-store/limits";

import {
  normalizeScope,
  type ScopeInput,
  type ResourceScope,
} from "../artifact-scope.js";
import { emptyObjectSchema, readHints, writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord, isEmptyObject } from "./validators.js";

const BLACKBOARD_OUTCOME_KIND = "blackboard.changed";
const SESSION_BLACKBOARD_RESOURCE_KIND = "session-blackboard";

interface BlackboardWriteInput {
  content: string;
  expectedRevision: string;
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
    handler: async (_input, ctx) => {
      const document = await repository.read(requireSessionId(ctx));
      assertBlackboardContent(document.content);
      return { data: document };
    },
  });

  registry.register({
    name: "sigil-blackboard-write",
    description:
      "Replace the shared markdown blackboard for the current session after reading it. Pass the read result's revision as expectedRevision; use an empty content string to clear it.",
    visibility: "always",
    approval: "write",
    input: shape<BlackboardWriteInput>(
      isBlackboardWriteInput,
      "Expected { content: string, expectedRevision: string }; the session comes from the request scope.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        content: { type: "string", maxLength: MAX_BLACKBOARD_CONTENT_CHARS },
        expectedRevision: { type: "string" },
      },
      required: ["content", "expectedRevision"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const sessionId = requireSessionId(ctx);
      const document = await repository.write(
        sessionId,
        input.content,
        ctx.auth?.principal?.id ?? "agent",
        input.expectedRevision,
      );
      return {
        data: {
          ...document,
          clientCommand: {
            type: "agent.domain.outcome" as const,
            payload: {
              id: `blackboard:${sessionId}:${document.revision}`,
              kind: BLACKBOARD_OUTCOME_KIND,
              resource: {
                kind: SESSION_BLACKBOARD_RESOURCE_KIND,
                id: sessionId,
              },
              operation: "blackboard.write",
              changedIds: [sessionId],
            },
          },
        },
      };
    },
  });
}

function isBlackboardWriteInput(value: unknown): value is BlackboardWriteInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["content", "expectedRevision"]) &&
    typeof value.content === "string" &&
    value.content.length <= MAX_BLACKBOARD_CONTENT_CHARS &&
    typeof value.expectedRevision === "string"
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
