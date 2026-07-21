"use client";

// Part-projection registry — WHERE and HOW agent message parts render.
//
// There is already a tool-renderer registry (`tool-renderer-registry.tsx`) that
// handles WHICH component renders a tool-call's output, keyed by tool name.
// This layer is the OTHER axis: the projection MODE — inline (transcript line,
// the default), overlay (anchored to a subject), or ambient (translucent
// working-commentary surface). It applies to ALL part types, not just
// tool-calls.
//
// The two compose:
//   - tool-renderer-registry  → what a tool-call's output looks like (a card,
//                               a JSON tree, an annotation excerpt)
//   - part-projection         → where it renders (inline | overlay | ambient)
// A surface says "sigil-annotate projects as an overlay" here, and the
// annotation's visual is a registered tool renderer there. Neither duplicates
// the other.
//
// (See AGENT-OUTPUT-PROJECTION-SPEC.md — "projection is NOT a parallel
// channel." This component is the registry that makes that true: one session,
// one tool-call record, the host merely renders it somewhere more truthful than
// a transcript line.)
//
// ADDITIVE BY CONSTRUCTION. With no provider, every part is `inline` — exactly
// today's behavior. A surface opts in by mounting <PartProjectionProvider>.

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type {
  AgentAuthorizationPart,
  AgentFilePart,
  AgentMessagePart,
  AgentReasoningPart,
  AgentTextPart,
  AgentToolCallPart,
} from "@zigil/agent-surface";

// ─── Projection modes ──────────────────────────────────────────────────────

/**
 * Where a part renders.
 * - `inline`  — the transcript line (today's only mode; the default).
 * - `overlay` — anchored to a subject (floats over an attention item;
 *               expands on hover). The mode for agent annotations.
 * - `ambient` — the translucent working-commentary surface; a target for
 *               reasoning/text. Not a promise of raw internal reasoning.
 */
export type ProjectionMode = "inline" | "overlay" | "ambient";

/**
 * The default mode for every part type and tool name. Adopting the registry
 * changes nothing: every part is inline until a surface overrides.
 */
export const DEFAULT_PROJECTION_MODE: ProjectionMode = "inline";

// ─── Projection registry ───────────────────────────────────────────────────
//
// A surface overrides modes by part-type and (for tool-calls) by tool name.
// `toolCallByName` is keyed by tool NAME; an MCP server prefix (`server__tool`)
// is stripped on lookup, matching `resolveToolRenderer`'s convention so a name
// registered under the bare tool name matches the namespaced call the model
// makes. (Q9: tool name carries the default mode; surfaces override per view.)

export interface PartProjectionConfig {
  /** Mode for `text` parts in this region. */
  readonly text?: ProjectionMode;
  /** Mode for `reasoning` parts in this region. */
  readonly reasoning?: ProjectionMode;
  /** Mode for `file` parts in this region. */
  readonly file?: ProjectionMode;
  /** Default mode for `tool-call` parts (applies when no name match). */
  readonly toolCall?: ProjectionMode;
  /** Per-tool-name mode. Wins over `toolCall` for matching names. */
  readonly toolCallByName?: Readonly<Record<string, ProjectionMode>>;
  /** Mode for `authorization` parts in this region. */
  readonly authorization?: ProjectionMode;
}

const PartProjectionContext = createContext<PartProjectionConfig | null>(null);

/**
 * Mount above a conversation to set how parts project in that region. Overrides
 * MERGE onto the defaults (you don't restate every mode), and `toolCallByName`
 * merges map-by-map so named overrides accumulate down the tree.
 *
 * Regions (§4.1 of the chrome spec): a provider scopes modes to a shell-owned
 * layout slot. A sidecar region can set `toolCallByName: { "sigil-annotate":
 * "overlay" }` while the dock region keeps everything inline — same session,
 * two presentations, no second conversation.
 */
export function PartProjectionProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: PartProjectionConfig;
}) {
  const parent = useContext(PartProjectionContext);
  const merged: PartProjectionConfig = {
    text: config.text ?? parent?.text,
    reasoning: config.reasoning ?? parent?.reasoning,
    file: config.file ?? parent?.file,
    toolCall: config.toolCall ?? parent?.toolCall,
    toolCallByName: {
      ...parent?.toolCallByName,
      ...config.toolCallByName,
    },
    authorization: config.authorization ?? parent?.authorization,
  };
  return (
    <PartProjectionContext.Provider value={merged}>
      {children}
    </PartProjectionContext.Provider>
  );
}

/**
 * Read the effective projection config for this region (null where unset; the
 * consumer defaults to `inline`). Exported for hosts that need the mode without
 * rendering — e.g. to route overlay parts to an attention surface.
 */
export function usePartProjection(): PartProjectionConfig {
  return useContext(PartProjectionContext) ?? {};
}

/**
 * The MCP server-prefix separator, matching `resolveToolRenderer`. A tool call
 * may arrive as `gonk__sigil-annotate`; a mode registered under the bare
 * `sigil-annotate` must still match.
 */
const MCP_PREFIX_SEP = "__";

function stripMcpPrefix(name: string): string {
  const sep = name.indexOf(MCP_PREFIX_SEP);
  return sep >= 0 ? name.slice(sep + MCP_PREFIX_SEP.length) : name;
}

/**
 * Resolve the projection mode for a single part. Tool-calls check
 * `toolCallByName` (by full name, then bare name) first, then fall back to the
 * generic `toolCall` mode, then the inline default.
 *
 * Pure — exported for testing and for hosts that route parts by mode before
 * rendering (an overlay surface collects all `overlay` parts; the transcript
 * renders the `inline` ones).
 */
export function resolveProjectionMode(
  config: PartProjectionConfig,
  part: AgentMessagePart,
): ProjectionMode {
  switch (part.type) {
    case "text":
      return config.text ?? DEFAULT_PROJECTION_MODE;
    case "reasoning":
      return config.reasoning ?? DEFAULT_PROJECTION_MODE;
    case "file":
      return config.file ?? DEFAULT_PROJECTION_MODE;
    case "tool-call":
      return (
        config.toolCallByName?.[part.name] ??
        config.toolCallByName?.[stripMcpPrefix(part.name)] ??
        config.toolCall ??
        DEFAULT_PROJECTION_MODE
      );
    case "authorization":
      return config.authorization ?? DEFAULT_PROJECTION_MODE;
  }
}

// ─── Inline renderers (today's transcript-line behavior) ───────────────────
//
// These are the inline projections — exactly what the old hardcoded <AgentPart>
// switch rendered. They are the default render for every part whose mode is
// `inline` (which, with no provider, is all of them). Non-inline modes
// (overlay/ambient) are routed by the host from `resolveProjectionMode`; this
// component renders the inline transcript and exports the inline primitives so
// the host can fall back to them when an overlay/ambient anchor doesn't resolve
// (per the spec's "fall back to inline" rule).

export function InlineText({ part }: { readonly part: AgentTextPart }) {
  return <p>{part.text}</p>;
}

export function InlineReasoning({
  part,
}: {
  readonly part: AgentReasoningPart;
}) {
  return <p>{part.text}</p>;
}

export function InlineFile({ part }: { readonly part: AgentFilePart }) {
  return <p>{part.filename ?? part.mediaType}</p>;
}

export function InlineToolCall({
  part,
}: {
  readonly part: AgentToolCallPart;
}) {
  return <p>{`${part.name}: ${part.state}`}</p>;
}

export function InlineAuthorization({
  part,
}: {
  readonly part: AgentAuthorizationPart;
}) {
  return <p>{`${part.displayName}: ${part.state}`}</p>;
}

/**
 * Render one part as an inline transcript line. This is the default render for
 * any part whose projection mode is `inline`. A host rendering overlay/ambient
 * parts uses `resolveProjectionMode` to route them and only falls back to this
 * when an anchor fails to resolve.
 *
 * Note: this renders the inline SUMMARY of a tool-call (`name: state`). Rich
 * tool-output rendering is owned by `tool-renderer-registry`'s `ToolCallSlot`,
 * which surfaces compose separately with interaction props. The two concerns
 * — projection mode (here) and output rendering (there) — are deliberately split.
 */
export function InlinePart({ part }: { readonly part: AgentMessagePart }) {
  switch (part.type) {
    case "text":
      return <InlineText part={part} />;
    case "reasoning":
      return <InlineReasoning part={part} />;
    case "file":
      return <InlineFile part={part} />;
    case "tool-call":
      return <InlineToolCall part={part} />;
    case "authorization":
      return <InlineAuthorization part={part} />;
  }
}

/**
 * Render all parts of a message in order as inline transcript lines. Drop-in
 * replacement for the old hardcoded <AgentPart> map in AgentHudConversation:
 * same signature, same default rendering. Additive — a surface can wrap this in
 * a <PartProjectionProvider> and route non-inline parts via
 * `resolveProjectionMode`, but with no provider every part is inline (today's
 * behavior, provably unchanged).
 */
export function MessageParts({
  parts,
}: {
  readonly parts: readonly AgentMessagePart[];
}) {
  return (
    <>
      {parts.map((part, index) => (
        <InlinePart key={`${part.type}:${index}`} part={part} />
      ))}
    </>
  );
}
