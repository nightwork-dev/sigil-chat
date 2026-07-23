import type { ComponentType, ReactNode } from "react"

import type {
  AgentToolCallPart,
  AgentToolInputResponse,
} from "@zigil/agent-surface/contracts"

/**
 * Custom UI for agent tool calls / outputs — a small registry keyed by tool
 * `name` (or `kind`), with a default renderer as fallback. Register app-specific
 * renderers at init; the message-part dispatch renders through {@link ToolCallSlot}.
 *
 * Self-contained by design: it depends only on the `@zigil/agent-surface`
 * contract. Lives in `@workspace/ui` alongside `agent-hud` — the design-system's
 * agent-UI tier. (A non-UI consumer would warrant moving this into
 * `@zigil/agent-react`; none exists yet, so the package split is deferred.)
 * Phase 2 hook: a renderer may inspect
 * `part.output`, and a future `block-spec` output kind can delegate to the block
 * runtime — additive, no rewrite.
 */
export interface ToolRendererProps {
  readonly part: AgentToolCallPart
  readonly canRespond: boolean
  readonly onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
  readonly onAlwaysAllow?: () => void
}

/** A tool renderer is a component (so it may use hooks), not a plain function. */
export type ToolRenderer = ComponentType<ToolRendererProps>

const byKey = new Map<string, ToolRenderer>()
let defaultRenderer: ToolRenderer | null = null

/**
 * Register a renderer for a specific tool `name`, or for an entire `kind` using
 * the key `kind:<kind>` (e.g. `"kind:skill-call"`). An exact name match wins
 * over a kind match. Call at app init, before the first render.
 */
export function registerToolRenderer(key: string, renderer: ToolRenderer): void {
  byKey.set(key, renderer)
}

/** The renderer used when no name/kind match is registered (the generic view). */
export function setDefaultToolRenderer(renderer: ToolRenderer): void {
  defaultRenderer = renderer
}

/**
 * Resolve a part's renderer: exact `name` → name with an MCP server prefix
 * (`server__tool`) stripped → `kind:<kind>` → default. The prefix-stripping lets
 * a renderer register under the bare tool name (`"sigil-generate-image"`) and
 * still match a transport-namespaced call (`"server__sigil-generate-image"`).
 */
export function resolveToolRenderer(
  part: AgentToolCallPart,
): ToolRenderer | null {
  const sep = part.name.indexOf("__")
  const bareName = sep >= 0 ? part.name.slice(sep + 2) : part.name
  return (
    byKey.get(part.name) ??
    byKey.get(bareName) ??
    (part.kind ? byKey.get(`kind:${part.kind}`) : undefined) ??
    defaultRenderer
  )
}

/**
 * Unwrap a tool part's `output` to the tool's structured data. What arrives here
 * is the raw MCP CallToolResult —
 * `{ content: [{ type: "text", text }], structuredContent?, isError }` — NOT the
 * data object the tool returned. A renderer wants the payload, so this prefers
 * `structuredContent`, falls back to parsing the JSON `text` content, and finally
 * returns the raw output (in case a future pipeline delivers data directly).
 * Every custom renderer that reads output should go through this.
 */
export function getToolOutputData(part: AgentToolCallPart): unknown {
  const output = part.output
  if (!output || typeof output !== "object") return output
  const record = output as Record<string, unknown>
  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent
  }
  const content = record.content
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "text" &&
        typeof (entry as { text?: unknown }).text === "string"
      ) {
        try {
          return JSON.parse((entry as { text: string }).text)
        } catch {
          // not JSON — keep looking / fall through
        }
      }
    }
  }
  return output
}

/**
 * Drop-in replacement for a hardcoded `<ToolCall .../>` at the message-part
 * dispatch: resolves the registered renderer for this tool-call part and renders
 * it as a component. Renders nothing if no renderer (incl. no default) is set.
 */
export function ToolCallSlot(props: ToolRendererProps): ReactNode {
  const Renderer = resolveToolRenderer(props.part)
  if (!Renderer) return null
  return <Renderer {...props} />
}
