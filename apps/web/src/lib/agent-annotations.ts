// Extract agent annotation tool-call outputs from a session, keyed by anchor.
//
// The surface-agnostic half of overlay projection: the agent calls
// sigil-annotate / pin / highlight returns { anchorId, body, kind, label },
// and this hook collects those outputs from the session messages so any surface
// can mount an AnnotationOverlay beside each resolved anchor (a Review passage,
// a Studio graph node, etc.).
//
// Pure extraction + a thin React hook over the app-global session. The hook is
// Review-local for now (single consumer); promote to a shared module if a
// second surface needs it.

import { useMemo } from "react"

import { useAgentRuntimeSession } from "@zigil/agent-react/session"
import { getToolOutputData } from "@workspace/ui/components/tool-renderer-registry"
import type { AgentToolCallPart } from "@zigil/agent-surface/contracts"

/** The annotation output shape produced by the Gonk annotation tools. */
export interface AgentAnnotation {
  readonly anchorId: string
  readonly body: string
  readonly kind: "note" | "pin" | "highlight"
  readonly label: string
  /** The tool-call part id (annotation identity for seen-receipts, per the spec). */
  readonly toolCallId: string
}

const ANNOTATION_TOOLS = new Set([
  "sigil-annotate",
  "sigil-pin",
  "sigil-highlight",
])

function isAnnotationOutput(
  value: unknown,
): value is Omit<AgentAnnotation, "toolCallId"> {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.anchorId === "string" &&
    typeof v.body === "string" &&
    (v.kind === "note" || v.kind === "pin" || v.kind === "highlight") &&
    typeof v.label === "string"
  )
}

/**
 * Extract annotation outputs from completed annotation tool-calls. Pure —
 * exported for testing without a session provider.
 */
export function extractAnnotations(
  parts: readonly AgentToolCallPart[],
): readonly AgentAnnotation[] {
  const out: AgentAnnotation[] = []
  for (const part of parts) {
    if (part.state !== "output-available") continue
    // Accept legacy transport-prefixed names retained in persisted sessions.
    const sep = part.name.indexOf("__")
    const bareName = sep >= 0 ? part.name.slice(sep + 2) : part.name
    if (!ANNOTATION_TOOLS.has(bareName)) continue
    const data = getToolOutputData(part)
    if (!isAnnotationOutput(data)) continue
    out.push({ ...data, toolCallId: part.id })
  }
  return out
}

/**
 * Read the app-global agent session and return its annotation outputs keyed by
 * anchorId. A passage with id === anchorId is where the overlay mounts. Returns
 * an empty array when there's no session or no annotation tool-calls yet.
 */
export function useAgentAnnotationsByAnchor(): ReadonlyMap<
  string,
  readonly AgentAnnotation[]
> {
  const session = useAgentRuntimeSession()
  return useMemo(() => {
    const toolCalls = session.data.messages.flatMap((m) =>
      m.parts.filter((p): p is AgentToolCallPart => p.type === "tool-call"),
    )
    const annotations = extractAnnotations(toolCalls)
    const byAnchor = new Map<string, AgentAnnotation[]>()
    for (const a of annotations) {
      const list = byAnchor.get(a.anchorId) ?? []
      list.push(a)
      byAnchor.set(a.anchorId, list)
    }
    return byAnchor
  }, [session.data.messages])
}
