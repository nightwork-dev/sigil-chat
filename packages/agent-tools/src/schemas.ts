import type { ToolHints } from "@gonk/tool-registry"

export const readHints = {
  mcp: {
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
} satisfies ToolHints

export const writeHints = {
  mcp: {
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
} satisfies ToolHints

export function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false }
}

export function stringArraySchema(): Record<string, unknown> {
  return {
    type: "array",
    minItems: 1,
    items: { type: "string", minLength: 1 },
  }
}
