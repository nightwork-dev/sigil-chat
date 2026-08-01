// Pure attribution logic for MDL.3 usage metering, split out of
// hooks/usage-metering.ts so it is testable without a live ledger or a real
// Eve hook context.
//
// Reads the same `sigilExecutionBinding` auth attribute JSON that
// `lib/session-model.ts` (the bound model), `lib/sigil-context.ts`'s
// `readExecutionApplicationThreadId`, and `lib/memory.ts`'s
// `executionBindingFromAttributes` each parse their own field from — one
// more narrow reader in that same family, not a new contract.

import {
  DEPLOYMENT_DEFAULT_PRESET_ID,
  type SigilAgentConfig,
} from "@workspace/runtime-env/config"

import { findModelPreset } from "./session-model"
import type { UsageLedgerAppendInput } from "./usage-ledger"

export interface StepCompletedEventLike {
  readonly data: {
    readonly turnId: string
    readonly stepIndex: number
    readonly usage?: {
      readonly inputTokens?: number
      readonly outputTokens?: number
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
    }
  }
}

export interface HookAuthContextLike {
  readonly session: {
    readonly auth: {
      readonly current?: {
        readonly attributes?: Readonly<
          Record<string, string | readonly string[]>
        >
        readonly principalId?: string
      } | null
      readonly initiator?: {
        readonly attributes?: Readonly<
          Record<string, string | readonly string[]>
        >
        readonly principalId?: string
      } | null
    }
  }
}

export type BuildUsageAppendInputResult =
  | { readonly kind: "record"; readonly input: UsageLedgerAppendInput }
  | { readonly kind: "skipped"; readonly reason: string }

/**
 * Resolves one `step.completed` event + hook context into the ledger append
 * input, or a reason it was skipped. Never throws — every failure to resolve
 * attribution is a `skipped` result, because a session that never completed
 * the verified execution binding (an eval harness run, a malformed replay)
 * has nothing true to attribute usage to.
 */
export function buildUsageAppendInput(
  event: StepCompletedEventLike,
  ctx: HookAuthContextLike,
  agent: SigilAgentConfig,
): BuildUsageAppendInputResult {
  const attributes = readAttributes(ctx)
  const applicationThreadId = readApplicationThreadId(attributes)
  const principalId =
    ctx.session.auth.current?.principalId ??
    ctx.session.auth.initiator?.principalId
  if (!applicationThreadId || !principalId) {
    return { kind: "skipped", reason: "no-verified-execution-binding" }
  }

  const bound = readBoundModel(attributes)
  const presetId = bound?.presetId ?? DEPLOYMENT_DEFAULT_PRESET_ID
  const preset = findModelPreset(agent, presetId)
  const provider = bound?.provider ?? preset?.provider
  const modelId = bound?.modelId ?? preset?.model
  if (!provider || !modelId) {
    return { kind: "skipped", reason: "unresolved-provider-or-model" }
  }

  const usage = event.data.usage
  const input: UsageLedgerAppendInput = {
    turnId: event.data.turnId,
    stepIndex: event.data.stepIndex,
    applicationThreadId,
    principalId,
    presetId,
    provider,
    modelId,
    isDeploymentDefault: presetId === DEPLOYMENT_DEFAULT_PRESET_ID,
    ...(usage !== undefined ? { usage: normalizeUsage(usage) } : {}),
    ...(preset?.pricing !== undefined ? { pricing: preset.pricing } : {}),
  }
  return { kind: "record", input }
}

function normalizeUsage(
  usage: NonNullable<StepCompletedEventLike["data"]["usage"]>,
) {
  return {
    ...(usage.inputTokens !== undefined
      ? { inputTokens: usage.inputTokens }
      : {}),
    ...(usage.outputTokens !== undefined
      ? { outputTokens: usage.outputTokens }
      : {}),
    ...(usage.cacheReadTokens !== undefined
      ? { cacheReadTokens: usage.cacheReadTokens }
      : {}),
    ...(usage.cacheWriteTokens !== undefined
      ? { cacheWriteTokens: usage.cacheWriteTokens }
      : {}),
  }
}

function readAttributes(
  ctx: HookAuthContextLike,
): Readonly<Record<string, string | readonly string[]>> | undefined {
  const auth = ctx.session.auth
  return auth.current?.attributes ?? auth.initiator?.attributes ?? undefined
}

function readApplicationThreadId(
  attributes: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const binding = parseExecutionBinding(attributes)
  const applicationThreadId = binding?.applicationThreadId
  return typeof applicationThreadId === "string" && applicationThreadId.trim()
    ? applicationThreadId.trim()
    : undefined
}

function readBoundModel(
  attributes: Readonly<Record<string, unknown>> | undefined,
): { presetId: string; provider: string; modelId: string } | undefined {
  const binding = parseExecutionBinding(attributes)
  const model = binding?.model
  if (typeof model !== "object" || model === null) return undefined
  const candidate = model as Record<string, unknown>
  return typeof candidate.presetId === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.modelId === "string"
    ? {
        presetId: candidate.presetId,
        provider: candidate.provider,
        modelId: candidate.modelId,
      }
    : undefined
}

function parseExecutionBinding(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  const raw = attributes?.sigilExecutionBinding
  if (typeof raw !== "string" || !raw.trim()) return undefined
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
}
