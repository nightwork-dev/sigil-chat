import { shape, type ToolRegistry } from "@gonk/tool-registry";
import {
  agentUiHighlightEffects,
  isAgentUiHighlightInput,
  type AgentUiHighlightInput,
} from "@workspace/agent-contracts/ui-highlight";

import {
  emptyObjectSchema,
  objectSchema,
  readHints,
} from "./domain-schemas.js";
import { isEmptyObject } from "./validators.js";

export function registerRuntimeTools(registry: ToolRegistry): void {
  registry.register({
    name: "sigil-chat-status",
    description:
      "Report the live Sigil Chat runtime architecture and server time.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({
      data: {
        application: "sigil-chat",
        agentRuntime: "eve",
        toolRegistry: "gonk",
        graphModel: "typed-reducer-graph",
        transport: "in-process-eve-tools",
        serverTime: new Date().toISOString(),
      },
    }),
  });
}

export function registerUiCommandTools(registry: ToolRegistry): void {
  registry.register({
    name: "sigil-ui-highlight",
    description:
      "Return a structured client command that highlights stable application target ids. Targets are semantic ids, never CSS selectors.",
    visibility: "always",
    approval: "read",
    input: shape<AgentUiHighlightInput>(
      isAgentUiHighlightInput,
      "Expected a non-empty actions array with targetIds and a supported effect.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          items: objectSchema(
            {
              targetIds: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: { type: "string", minLength: 1 },
              },
              effect: {
                type: "string",
                enum: [...agentUiHighlightEffects],
              },
            },
            ["targetIds", "effect"],
          ),
        },
        clearPrevious: { type: "boolean" },
      },
      required: ["actions"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => ({
      data: {
        clientCommand: {
          type: "ui.highlight",
          payload: {
            clearPrevious: input.clearPrevious ?? true,
            actions: input.actions,
          },
        },
        command: {
          type: "ui.highlight",
          clearPrevious: input.clearPrevious ?? true,
          actions: input.actions,
        },
      },
    }),
  });
}
