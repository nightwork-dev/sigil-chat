// Per-session model resolution for the Eve host.
//
// One Eve process serves every session, and `defineAgent({ model })` binds one
// model at startup — so "chat with Eve while she's luna" cannot be a startup
// decision. Eve's dynamic model slot is the seam: a resolver runs at
// `session.started` and returns the model for THAT session, falling back to the
// compiled static model when a session made no choice.
//
// Trust boundary: the preset id arrives inside the SIGNED session-binding
// proof, which the web server mints from the thread's immutable execution
// binding. The browser never sends a model, a base URL, or a credential
// reference — it sends a thread id, and the server looks up what that thread
// was bound to. A forged or edited attribute cannot select a model, because
// the attribute is only populated after Eve verifies the proof's HMAC.
//
// `session.started` (not `turn.started`/`step.started`) is deliberate: the
// model must be stable for the life of the session. Re-resolving mid-session
// would invalidate the prompt cache on every turn, which is the same cost that
// makes mid-session switching its own story.

import type { LanguageModel } from "ai"

import {
  isBoundAgentModel,
  type BoundAgentModel,
} from "@workspace/agent-contracts/model-binding"
import {
  normalizeSigilAgentModelPresets,
  type NormalizedSigilAgentModelPreset,
  type SigilAgentConfig,
} from "@workspace/runtime-env/config"

import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  resolveSigilAgentModel,
  type ResolveSigilAgentModelOptions,
} from "./model-provider"

/** Attribute key eve.ts writes the verified execution binding into. */
export const EXECUTION_BINDING_ATTRIBUTE = "sigilExecutionBinding"

/** Why a bound model could not be honoured. */
export type UnresolvedBoundModelReason =
  | "preset-not-found"
  | "provider-unavailable"

export interface UnresolvedBoundModelEvent {
  readonly presetId: string
  readonly reason: UnresolvedBoundModelReason
  readonly detail?: string
}

export interface ResolveSessionModelOptions
  extends ResolveSigilAgentModelOptions {
  /**
   * Called when a session's bound model cannot be honoured and the deployment
   * default will be used instead.
   *
   * Falling back is correct — a conversation should not die because a fixture
   * was edited — but it MUST NOT be silent. A user who chose luna and is
   * quietly answered by terra has no way to tell, and neither does an
   * operator reading a transcript later.
   */
  readonly onUnresolved?: (event: UnresolvedBoundModelEvent) => void
}

/** Default sink: a warning naming the id that no longer resolves. */
export function warnUnresolvedBoundModel(
  event: UnresolvedBoundModelEvent,
): void {
  console.warn(
    `[sigil] session model "${event.presetId}" could not be resolved (${event.reason}${
      event.detail ? `: ${event.detail}` : ""
    }); falling back to the deployment default.`,
  )
}

export interface SessionModelSelection {
  readonly model: LanguageModel | string
  readonly modelContextWindowTokens: number
  /** Identity of what was resolved, for receipts and diagnostics. */
  readonly presetId: string
  readonly provider: string
  readonly modelId: string
}

export function findModelPreset(
  agent: SigilAgentConfig,
  presetId: string,
): NormalizedSigilAgentModelPreset | undefined {
  return normalizeSigilAgentModelPresets(agent).find(
    (preset) => preset.id === presetId,
  )
}

/**
 * Read the bound model out of Eve's verified auth attributes.
 *
 * Returns undefined for every failure — absent attribute, unparseable JSON,
 * malformed model — because "this session made no model choice" and "this
 * session's choice is unreadable" must both land on the deployment default
 * rather than failing a conversation the user is already in.
 */
export function readBoundModelFromAttributes(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
): BoundAgentModel | undefined {
  const raw = attributes?.[EXECUTION_BINDING_ATTRIBUTE]
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== "object" || parsed === null) return undefined
  const model = (parsed as { model?: unknown }).model
  return isBoundAgentModel(model) ? model : undefined
}

/**
 * Turn a bound model into a live model handle.
 *
 * The bound record carries a snapshot of provider/model, but the resolver is
 * driven by the PRESET so credentials and base URL come from current authored
 * config rather than from anything that travelled over the wire. A preset that
 * has since been removed from the fixture, or whose credential is missing,
 * yields null — the caller falls back to the deployment default instead of
 * breaking the session.
 */
export function resolveSessionModel(
  agent: SigilAgentConfig,
  bound: BoundAgentModel | undefined,
  options: ResolveSessionModelOptions = {},
): SessionModelSelection | null {
  // No bound model is the ordinary default-session case, not a failure, so it
  // is silent. Everything below is a session that ASKED for something and did
  // not get it.
  if (!bound) return null
  const report = options.onUnresolved ?? warnUnresolvedBoundModel
  const preset = findModelPreset(agent, bound.presetId)
  if (!preset) {
    report({ presetId: bound.presetId, reason: "preset-not-found" })
    return null
  }
  try {
    const resolved = resolveSigilAgentModel(
      {
        provider: preset.provider,
        model: preset.model,
        ...(preset.baseUrl !== undefined ? { baseUrl: preset.baseUrl } : {}),
        ...(preset.apiKeyEnv !== undefined
          ? { apiKeyEnv: preset.apiKeyEnv }
          : {}),
        ...(preset.contextWindowTokens !== undefined
          ? { contextWindowTokens: preset.contextWindowTokens }
          : {}),
      },
      options,
    )
    return {
      model: resolved.model,
      modelContextWindowTokens:
        preset.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
      presetId: preset.id,
      provider: preset.provider,
      modelId: preset.model,
    }
  } catch (error) {
    // MissingModelCredentialError and friends: a session should degrade to the
    // deployment default, not fail to start — but say so.
    report({
      presetId: bound.presetId,
      reason: "provider-unavailable",
      detail: error instanceof Error ? error.message : undefined,
    })
    return null
  }
}

/**
 * Resolve the model for one Eve session from its verified auth attributes.
 *
 * `null` means "use the compiled fallback" in Eve's dynamic-model contract.
 */
export function resolveSessionModelFromAuth(
  agent: SigilAgentConfig,
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  options: ResolveSessionModelOptions = {},
): SessionModelSelection | null {
  return resolveSessionModel(
    agent,
    readBoundModelFromAttributes(attributes),
    options,
  )
}

interface DynamicResolveSessionLike {
  readonly session?: {
    readonly auth?: {
      readonly current?: {
        readonly attributes?: Readonly<
          Record<string, string | readonly string[]>
        >
      } | null
      readonly initiator?: {
        readonly attributes?: Readonly<
          Record<string, string | readonly string[]>
        >
      } | null
    }
  }
}

/**
 * Attributes for the session being resolved.
 *
 * `current` is the authenticated context for this request; `initiator` is the
 * one that opened the session. A delegated/subagent session can arrive with no
 * `current`, so the initiator is the correct fallback — it is the context whose
 * binding proof was verified when the conversation began.
 */
export function readResolveContextAttributes(
  ctx: unknown,
): Readonly<Record<string, string | readonly string[]>> | undefined {
  const auth = (ctx as DynamicResolveSessionLike | undefined)?.session?.auth
  return auth?.current?.attributes ?? auth?.initiator?.attributes ?? undefined
}
