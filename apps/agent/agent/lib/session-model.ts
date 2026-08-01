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

import type { AgentModelOptionsDefinition } from "eve"
import type { LanguageModel } from "ai"

import {
  isBoundAgentModel,
  type BoundAgentModel,
} from "@workspace/agent-contracts/model-binding"
import {
  normalizeSigilAgentModelPresets,
  normalizeSigilAgentProviders,
  type NormalizedSigilAgentModelPreset,
  type SigilAgentConfig,
} from "@workspace/runtime-env/config"

import {
  readDiscoveredModelCache,
  type DiscoveredModelCacheEntry,
} from "./discovered-model-cache"
import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  resolveSigilAgentModel,
  type ResolveSigilAgentModelOptions,
} from "./model-provider"
import {
  buildReasoningProviderOptions,
  type ReasoningRequestSelection,
} from "./reasoning-provider-options"

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
  /**
   * MDL.2's discovery cache. Defaults to the real cache; overridable so tests
   * exercise the merge without a store, and so a future caller that already
   * has a fresher read can pass it through instead of paying a second one.
   */
  readonly discovered?: readonly DiscoveredModelCacheEntry[]
  /**
   * Mutable per-turn request parameters (MDL.4) — reasoning level and fast
   * mode. Unlike `bound`, this is never signed as session identity: it rides
   * the same verified attribute blob but is re-read fresh on every
   * `step.started` resolve, which is exactly what lets it change mid-session
   * with no fork and no prompt-cache identity cost.
   */
  readonly requestOptions?: ReasoningRequestSelection
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
  /**
   * Provider options carrying the resolved reasoning level / fast mode, when
   * either was requested and the preset declares support. Forwarded onto
   * Eve's `step.started` model selection as `modelOptions.providerOptions`.
   */
  readonly modelOptions?: AgentModelOptionsDefinition
  /**
   * What was actually applied, after clamping against the preset's
   * declaration — for receipts and the client's "resolved, not optimistic"
   * requirement (MDL.4 AC1). Absent when the preset declares no reasoning
   * support at all, distinct from "off" which is a real applied value.
   */
  readonly resolvedReasoningLevel?: string
  readonly resolvedFastMode?: boolean
}

/**
 * `discovered` defaults to the real MDL.2 cache but is overridable so callers
 * (and every test in this file) can exercise the merge without a real store.
 */
export function findModelPreset(
  agent: SigilAgentConfig,
  presetId: string,
  discovered: readonly DiscoveredModelCacheEntry[] = readDiscoveredModelCache(),
): NormalizedSigilAgentModelPreset | undefined {
  const authored = normalizeSigilAgentModelPresets(agent).find(
    (preset) => preset.id === presetId,
  )
  if (authored) return authored
  return synthesizeDiscoveredPreset(agent, presetId, discovered)
}

/**
 * Turn a cached discovery entry into a resolvable preset by borrowing its
 * PROVIDER's transport facts from the current fixture — the cache never
 * carries a `baseUrl` or credential reference of its own (see
 * discovered-model-cache.ts). A provider the fixture has since removed or
 * disabled yields undefined, same as any other preset that no longer
 * resolves: the caller falls back to the deployment default rather than
 * failing the session.
 */
function synthesizeDiscoveredPreset(
  agent: SigilAgentConfig,
  presetId: string,
  discovered: readonly DiscoveredModelCacheEntry[],
): NormalizedSigilAgentModelPreset | undefined {
  const entry = discovered.find((candidate) => candidate.id === presetId)
  if (!entry) return undefined
  const provider = normalizeSigilAgentProviders(agent).find(
    (candidate) => candidate.id === entry.providerId,
  )
  if (!provider || !provider.enabled) return undefined
  return {
    id: entry.id,
    label: entry.label,
    providerId: provider.id,
    providerLabel: provider.label,
    provider: provider.kind,
    model: entry.model,
    capability: "chat",
    enabled: true,
    isDeploymentDefault: false,
    // No fixture declaration behind a discovered model, so no fast mode and
    // no reasoning levels (MDL.4: declared, never sniffed).
    fastMode: false,
    source: "object",
    ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
    ...(provider.apiKeyEnv !== undefined
      ? { apiKeyEnv: provider.apiKeyEnv }
      : {}),
    contextWindowTokens:
      entry.contextWindowTokens ??
      provider.models[0]?.contextWindowTokens ??
      DEFAULT_CONTEXT_WINDOW_TOKENS,
  }
}

/**
 * Clamp a requested reasoning selection against what the resolved preset
 * actually declares, and translate it into provider options.
 *
 * "Clamp", not "reject": an invalid or missing requested level falls back to
 * the preset's own declared default rather than dropping the control — a
 * thread whose fixture declaration changed underneath it should not lose
 * reasoning control entirely, the same falling-back posture
 * resolveSessionModel already takes for the model identity itself. Fast mode
 * is dropped outright (not clamped to false-and-forwarded) when the preset
 * does not declare it, so a provider that cannot honor it is never asked to.
 */
function applyReasoningSelection(
  preset: NormalizedSigilAgentModelPreset,
  requested: ReasoningRequestSelection | undefined,
): {
  modelOptions?: AgentModelOptionsDefinition
  reasoningLevel?: string
  fastMode?: boolean
} {
  const reasoningLevel = preset.reasoning
    ? (requested?.reasoningLevel !== undefined &&
      preset.reasoning.levels.includes(requested.reasoningLevel)
        ? requested.reasoningLevel
        : preset.reasoning.default)
    : undefined
  const fastMode = preset.fastMode ? (requested?.fastMode ?? false) : undefined

  const providerOptions = buildReasoningProviderOptions(
    preset.provider,
    { reasoningLevel, fastMode },
    preset.reasoning?.levels,
  )

  return {
    ...(providerOptions ? { modelOptions: { providerOptions } } : {}),
    ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
    ...(fastMode !== undefined ? { fastMode } : {}),
  }
}

/**
 * Read the thread's current mutable request options (reasoning level / fast
 * mode) out of the same verified `sigilExecutionBinding` attribute the bound
 * model travels in.
 *
 * Riding the same attribute as `model` is deliberate: eve.ts already mints
 * that blob fresh on every turn from the live thread record (see
 * agent-session-binding.ts's "minted for every turn" comment), which is
 * exactly the mutability MDL.4 needs — no separate signing path, and no risk
 * of the two attributes disagreeing about which turn they describe. Unlike
 * `model`, an absent or malformed `requestOptions` block is never a "session
 * asked for something and did not get it" case: the field is genuinely
 * optional per turn, so silence here is ordinary, not a fallback worth
 * reporting.
 */
export function readRequestOptionsFromAttributes(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
): ReasoningRequestSelection | undefined {
  const raw = attributes?.[EXECUTION_BINDING_ATTRIBUTE]
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== "object" || parsed === null) return undefined
  const requestOptions = (parsed as { requestOptions?: unknown }).requestOptions
  if (typeof requestOptions !== "object" || requestOptions === null) {
    return undefined
  }
  const candidate = requestOptions as {
    reasoningLevel?: unknown
    fastMode?: unknown
  }
  const reasoningLevel =
    typeof candidate.reasoningLevel === "string" &&
    candidate.reasoningLevel.trim().length > 0
      ? candidate.reasoningLevel
      : undefined
  const fastMode =
    typeof candidate.fastMode === "boolean" ? candidate.fastMode : undefined
  if (reasoningLevel === undefined && fastMode === undefined) return undefined
  return {
    ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
    ...(fastMode !== undefined ? { fastMode } : {}),
  }
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
  const preset =
    options.discovered !== undefined
      ? findModelPreset(agent, bound.presetId, options.discovered)
      : findModelPreset(agent, bound.presetId)
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
    const applied = applyReasoningSelection(preset, options.requestOptions)
    return {
      model: resolved.model,
      modelContextWindowTokens:
        preset.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
      presetId: preset.id,
      provider: preset.provider,
      modelId: preset.model,
      ...(applied.modelOptions ? { modelOptions: applied.modelOptions } : {}),
      ...(applied.reasoningLevel !== undefined
        ? { resolvedReasoningLevel: applied.reasoningLevel }
        : {}),
      ...(applied.fastMode !== undefined
        ? { resolvedFastMode: applied.fastMode }
        : {}),
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
  // Attribute-derived request options are read fresh here — this is the part
  // of the flow that runs at `step.started` (agent.ts), so a reasoning/fast
  // mode change picked up between one step and the next is exactly what
  // "mutable, no fork" (MDL.4) means in practice. An explicit
  // `options.requestOptions` (used directly by tests and any future
  // non-attribute caller) wins over the attribute-derived value rather than
  // being silently overwritten by it.
  const requestOptions =
    options.requestOptions ?? readRequestOptionsFromAttributes(attributes)
  return resolveSessionModel(agent, readBoundModelFromAttributes(attributes), {
    ...options,
    ...(requestOptions ? { requestOptions } : {}),
  })
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
