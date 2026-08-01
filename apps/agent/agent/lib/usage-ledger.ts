// Usage metering ledger (MDL.3): tokens and cost per app, user, session, and
// model.
//
// Two stores, matching the brief's shape ("append-only events plus cheap
// rollups"):
//
//   - `log`: one `UsageLedgerRecord` per completed model call (Eve's
//     `step.completed`), append-only, never rewritten. This is the audit
//     trail — every number a rollup reports is reconstructable from it.
//   - `kv`: rollup buckets keyed by attribution axis (`app`, `user:<id>`,
//     `model:<presetId>`, `day:<yyyy-mm-dd>`, `session:<applicationThreadId>`),
//     updated on every append. `KvStore.entries(prefix)` answers "usage by
//     user" or "usage by model" in one read — no raw-record scan — which is
//     acceptance criterion 2.
//
// Attribution uses `applicationThreadId`, the durable web-owned thread id,
// not Eve's ephemeral `session.id` — a runtime session can rotate mid-thread
// (recompaction, reconnect) and the ledger must not fork attribution when it
// does (criterion 5).
//
// Cost is carried in a currency-neutral integer unit — "micros" (1 credit
// unit = 1e-6 of the record's currency) — rather than a float, so summed
// rollups do not accumulate floating-point drift and a future credit ledger
// can debit whole units. A record with no resolvable price carries no cost
// field at all: token counts still record, degrading rather than guessing
// (criterion 4), and a step with no provider usage at all is `reported:
// false` rather than backfilled with zeros (criterion 6 / the story's
// truthfulness rule).

import type { KvStore, LogStore } from "@gonk/store/types"

/** Provider-reported token usage for one completed model call. */
export interface UsageLedgerTokenUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

export interface UsageLedgerAppendInput {
  readonly turnId: string
  readonly stepIndex: number
  readonly applicationThreadId: string
  readonly principalId: string
  /** `deployment-default`, or `<providerId>/<modelId>`. */
  readonly presetId: string
  readonly provider: string
  readonly modelId: string
  readonly isDeploymentDefault: boolean
  /** Undefined when the step carried no usage at all (`reported: false`). */
  readonly usage?: UsageLedgerTokenUsage
  /** USD per 1M tokens, when the fixture prices this preset. */
  readonly pricing?: {
    readonly inputPerMillionTokens?: number
    readonly outputPerMillionTokens?: number
  }
  readonly recordedAt?: string
}

export interface UsageLedgerRecord {
  readonly recordId: string
  readonly recordedAt: string
  readonly turnId: string
  readonly stepIndex: number
  readonly applicationThreadId: string
  readonly principalId: string
  readonly presetId: string
  readonly provider: string
  readonly modelId: string
  readonly isDeploymentDefault: boolean
  readonly reported: boolean
  readonly usage?: UsageLedgerTokenUsage
  /** Present only when both a token count and a matching rate exist. */
  readonly costMicros?: number
  readonly currency?: "usd"
}

/** One attribution bucket, accumulated across every record folded into it. */
export interface UsageAggregateBucket {
  readonly turnCount: number
  readonly reportedTurnCount: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** Turns whose cost contributed to `costMicros`. */
  readonly pricedTurnCount: number
  readonly costMicros: number
  readonly currency: "usd"
}

export interface UsageAggregateEntry {
  readonly key: string
  readonly bucket: UsageAggregateBucket
}

export interface UsageAggregates {
  readonly app: UsageAggregateBucket
  readonly byUser: readonly UsageAggregateEntry[]
  readonly byModel: readonly UsageAggregateEntry[]
  readonly byDay: readonly UsageAggregateEntry[]
  readonly bySession: readonly UsageAggregateEntry[]
}

export interface UsageLedgerRepository {
  append(input: UsageLedgerAppendInput): UsageLedgerRecord
  aggregates(): UsageAggregates
}

const USER_PREFIX = "user:"
const MODEL_PREFIX = "model:"
const DAY_PREFIX = "day:"
const SESSION_PREFIX = "session:"
const APP_KEY = "app"

const EMPTY_BUCKET: UsageAggregateBucket = {
  turnCount: 0,
  reportedTurnCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  pricedTurnCount: 0,
  costMicros: 0,
  currency: "usd",
}

export class MirkUsageLedgerRepository implements UsageLedgerRepository {
  private readonly log: LogStore<UsageLedgerRecord>
  private readonly rollups: KvStore<UsageAggregateBucket>
  private readonly now: () => string

  constructor(options: {
    log: LogStore<UsageLedgerRecord>
    rollups: KvStore<UsageAggregateBucket>
    now?: () => string
  }) {
    this.log = options.log
    this.rollups = options.rollups
    this.now = options.now ?? (() => new Date().toISOString())
  }

  append(input: UsageLedgerAppendInput): UsageLedgerRecord {
    const record = buildRecord(input, this.now())
    this.log.append(record)
    this.bump(APP_KEY, record)
    this.bump(`${USER_PREFIX}${record.principalId}`, record)
    this.bump(`${MODEL_PREFIX}${record.presetId}`, record)
    this.bump(`${DAY_PREFIX}${dayKey(record.recordedAt)}`, record)
    this.bump(`${SESSION_PREFIX}${record.applicationThreadId}`, record)
    return record
  }

  aggregates(): UsageAggregates {
    return {
      app: this.rollups.get(APP_KEY) ?? EMPTY_BUCKET,
      byUser: stripPrefix(this.rollups.entries(USER_PREFIX), USER_PREFIX),
      byModel: stripPrefix(this.rollups.entries(MODEL_PREFIX), MODEL_PREFIX),
      byDay: stripPrefix(this.rollups.entries(DAY_PREFIX), DAY_PREFIX),
      bySession: stripPrefix(
        this.rollups.entries(SESSION_PREFIX),
        SESSION_PREFIX,
      ),
    }
  }

  private bump(key: string, record: UsageLedgerRecord): void {
    const current = this.rollups.get(key) ?? EMPTY_BUCKET
    this.rollups.set(key, foldRecord(current, record))
  }
}

/** In-memory implementation for tests and any host without a store. */
export class MemoryUsageLedgerRepository implements UsageLedgerRepository {
  private readonly records: UsageLedgerRecord[] = []
  private readonly rollups = new Map<string, UsageAggregateBucket>()
  private readonly now: () => string

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now
  }

  append(input: UsageLedgerAppendInput): UsageLedgerRecord {
    const record = buildRecord(input, this.now())
    this.records.push(record)
    this.bump(APP_KEY, record)
    this.bump(`${USER_PREFIX}${record.principalId}`, record)
    this.bump(`${MODEL_PREFIX}${record.presetId}`, record)
    this.bump(`${DAY_PREFIX}${dayKey(record.recordedAt)}`, record)
    this.bump(`${SESSION_PREFIX}${record.applicationThreadId}`, record)
    return structuredClone(record)
  }

  aggregates(): UsageAggregates {
    return {
      app: this.rollups.get(APP_KEY) ?? EMPTY_BUCKET,
      byUser: stripPrefixMap(this.rollups, USER_PREFIX),
      byModel: stripPrefixMap(this.rollups, MODEL_PREFIX),
      byDay: stripPrefixMap(this.rollups, DAY_PREFIX),
      bySession: stripPrefixMap(this.rollups, SESSION_PREFIX),
    }
  }

  /** Raw records in append order, for tests that assert on the audit trail. */
  list(): readonly UsageLedgerRecord[] {
    return this.records.map((record) => structuredClone(record))
  }

  private bump(key: string, record: UsageLedgerRecord): void {
    const current = this.rollups.get(key) ?? EMPTY_BUCKET
    this.rollups.set(key, foldRecord(current, record))
  }
}

function buildRecord(
  input: UsageLedgerAppendInput,
  fallbackNow: string,
): UsageLedgerRecord {
  const recordedAt = input.recordedAt ?? fallbackNow
  const reported = input.usage !== undefined
  const costMicros = reported
    ? computeCostMicros(input.usage, input.pricing)
    : undefined
  return {
    recordId: `${input.turnId}:${input.stepIndex}`,
    recordedAt,
    turnId: input.turnId,
    stepIndex: input.stepIndex,
    applicationThreadId: input.applicationThreadId,
    principalId: input.principalId,
    presetId: input.presetId,
    provider: input.provider,
    modelId: input.modelId,
    isDeploymentDefault: input.isDeploymentDefault,
    reported,
    ...(input.usage !== undefined ? { usage: input.usage } : {}),
    ...(costMicros !== undefined ? { costMicros, currency: "usd" } : {}),
  }
}

/**
 * USD micros (1 credit unit = one-millionth of a dollar) so summed rollups
 * stay exact integers. Undefined whenever either the rate or the matching
 * token count is missing — never a partial/estimated figure (criterion 4).
 */
function computeCostMicros(
  usage: UsageLedgerTokenUsage | undefined,
  pricing: UsageLedgerAppendInput["pricing"],
): number | undefined {
  if (!usage || !pricing) return undefined
  let micros: number | undefined
  if (
    usage.inputTokens !== undefined &&
    pricing.inputPerMillionTokens !== undefined
  ) {
    micros =
      (micros ?? 0) + usage.inputTokens * pricing.inputPerMillionTokens
  }
  if (
    usage.outputTokens !== undefined &&
    pricing.outputPerMillionTokens !== undefined
  ) {
    micros =
      (micros ?? 0) + usage.outputTokens * pricing.outputPerMillionTokens
  }
  return micros === undefined ? undefined : Math.round(micros)
}

function foldRecord(
  bucket: UsageAggregateBucket,
  record: UsageLedgerRecord,
): UsageAggregateBucket {
  return {
    turnCount: bucket.turnCount + 1,
    reportedTurnCount: bucket.reportedTurnCount + (record.reported ? 1 : 0),
    inputTokens: bucket.inputTokens + (record.usage?.inputTokens ?? 0),
    outputTokens: bucket.outputTokens + (record.usage?.outputTokens ?? 0),
    cacheReadTokens:
      bucket.cacheReadTokens + (record.usage?.cacheReadTokens ?? 0),
    cacheWriteTokens:
      bucket.cacheWriteTokens + (record.usage?.cacheWriteTokens ?? 0),
    pricedTurnCount:
      bucket.pricedTurnCount + (record.costMicros !== undefined ? 1 : 0),
    costMicros: bucket.costMicros + (record.costMicros ?? 0),
    currency: "usd",
  }
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function stripPrefix(
  entries: Array<{ key: string; value: UsageAggregateBucket }>,
  prefix: string,
): UsageAggregateEntry[] {
  return entries.map(({ key, value }) => ({
    key: key.slice(prefix.length),
    bucket: value,
  }))
}

function stripPrefixMap(
  rollups: Map<string, UsageAggregateBucket>,
  prefix: string,
): UsageAggregateEntry[] {
  return [...rollups.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, bucket]) => ({ key: key.slice(prefix.length), bucket }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
