// Server-only persistence + resolution for user_settings (S10.4 migration
// 0002). Raw SQL via the shared libsql client — matches the style of
// ../auth/policy.ts rather than introducing a kysely query path for one
// narrow table.

import { randomUUID } from "node:crypto"
import type { Client } from "@libsql/client"

import type {
  SettingContributingLinkKind,
  SettingDefinition,
  SettingKey,
  SettingResolutionScopeKind,
  SettingScopeKind,
  UserSettingRecord,
} from "./registry"
import { getSettingDefinition, isScopeAllowed } from "./registry"

export class SettingRevisionConflictError extends Error {
  readonly status = 409

  constructor(key: string) {
    super(`Setting "${key}" was changed by another write — refetch and retry`)
    this.name = "SettingRevisionConflictError"
  }
}

export class SettingScopeNotAllowedError extends Error {
  readonly status = 400

  constructor(key: string, scopeKind: SettingScopeKind) {
    super(`Setting "${key}" cannot be written at scope "${scopeKind}"`)
    this.name = "SettingScopeNotAllowedError"
  }
}

interface Row {
  value: string
  revision: number
  updated_at: string
}

async function readRow(
  client: Client,
  input: { userId: string; scopeKind: SettingScopeKind; scopeId: string; key: string },
): Promise<Row | null> {
  const result = await client.execute({
    sql: `SELECT value, revision, updated_at FROM user_settings
          WHERE user_id = ? AND scope_kind = ? AND scope_id = ? AND key = ?`,
    args: [input.userId, input.scopeKind, input.scopeId, input.key],
  })
  const row = result.rows[0]
  if (!row) return null
  return {
    value: String(row.value),
    revision: Number(row.revision),
    updated_at: String(row.updated_at),
  }
}

export async function getUserSettingRecord(
  client: Client,
  input: { userId: string; scopeKind: SettingScopeKind; scopeId: string; key: SettingKey },
): Promise<UserSettingRecord | null> {
  const row = await readRow(client, input)
  if (!row) return null
  return {
    userId: input.userId,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    key: input.key,
    value: JSON.parse(row.value) as unknown,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

export interface ResolvedSetting<T = unknown> {
  value: T
  /** Which tier supplied the value, or "default" when nothing was ever written. */
  source: SettingScopeKind | "default"
  revision: number | null
}

export type SettingContributionVisibility =
  | { readonly kind: "discoverable" }
  | {
      readonly kind: "hidden-mandatory-policy"
      /** A policy class only: never a scope id, name, or inaccessible value. */
      readonly policyClass:
        "installation-policy" | "organization-policy" | "project-policy"
    }

/**
 * An explicit input to SC.4 setting resolution. `order` is semantic
 * precedence (least to most specific), not database/query order.
 */
export interface SettingResolutionCandidate<T> {
  readonly scopeId: string
  readonly scopeKind: SettingResolutionScopeKind
  readonly order: number
  readonly value: T
  readonly linkKind?: SettingContributingLinkKind
  readonly visibility: SettingContributionVisibility
}

export type SettingContributionReceipt =
  | {
      readonly kind: "scope"
      readonly scopeId: string
      readonly scopeKind: SettingResolutionScopeKind
    }
  | {
      readonly kind: "mandatory-policy"
      readonly policyClass:
        "installation-policy" | "organization-policy" | "project-policy"
    }

export interface ResolvedSettingWithReceipt<T> {
  readonly value: T
  readonly receipt: readonly SettingContributionReceipt[]
}

/**
 * Pure, definition-owned SC.4 resolution. It intentionally does not read the
 * legacy `user_settings` table; callers provide already-authorized candidate
 * scopes and a discoverability projection for the receipt.
 */
export function resolveSettingCandidates<T>(
  definition: SettingDefinition<T>,
  candidates: readonly SettingResolutionCandidate<T>[],
): ResolvedSettingWithReceipt<T> {
  const eligible = candidates
    .filter((candidate) => isEligibleSettingContribution(definition, candidate))
    .sort(compareSettingCandidates)

  if (eligible.length === 0) {
    return { value: definition.defaultValue, receipt: [] }
  }

  if (definition.mergeMode === "replace") {
    const contribution = eligible.at(-1)
    if (!contribution) return { value: definition.defaultValue, receipt: [] }
    return {
      value: contribution.value,
      receipt: [toReceipt(contribution)],
    }
  }

  if (definition.mergeMode === "deep-merge") {
    const value = eligible.reduce<Record<string, unknown>>(
      (merged, contribution) => {
        if (!isPlainRecord(contribution.value)) {
          throw new Error(
            `Setting "${definition.key}" requires record contributions.`,
          )
        }
        return { ...merged, ...contribution.value }
      },
      {},
    )
    return { value: value as T, receipt: eligible.map(toReceipt) }
  }

  if (definition.mergeMode === "set-union") {
    const value: unknown[] = []
    for (const contribution of eligible) {
      if (!Array.isArray(contribution.value)) {
        throw new Error(
          `Setting "${definition.key}" requires array contributions.`,
        )
      }
      for (const member of contribution.value) {
        if (!value.some((existing) => Object.is(existing, member)))
          value.push(member)
      }
    }
    return { value: value as T, receipt: eligible.map(toReceipt) }
  }

  return {
    value: definition.mergeMode.resolve({
      defaultValue: definition.defaultValue,
      contributions: eligible.map((contribution) => contribution.value),
    }),
    receipt: eligible.map(toReceipt),
  }
}

function isEligibleSettingContribution<T>(
  definition: SettingDefinition<T>,
  candidate: SettingResolutionCandidate<T>,
): boolean {
  if (!definition.allowedScopeKinds.includes(candidate.scopeKind)) return false
  if (
    candidate.linkKind !== undefined &&
    !definition.allowedContributingLinkKinds.includes(candidate.linkKind)
  ) {
    return false
  }
  if (
    candidate.scopeKind === "personal" &&
    !definition.allowsPersonalOverride
  ) {
    return false
  }

  // Defensively enforce the invariant even if an invalid definition entered
  // through an untyped boundary: security cannot resolve via a composition
  // link or a personal scope.
  return !(
    definition.affectsSecurity &&
    (candidate.scopeKind === "personal" || candidate.linkKind !== undefined)
  )
}

function compareSettingCandidates<T>(
  left: SettingResolutionCandidate<T>,
  right: SettingResolutionCandidate<T>,
): number {
  return (
    left.order - right.order ||
    left.scopeKind.localeCompare(right.scopeKind) ||
    left.scopeId.localeCompare(right.scopeId) ||
    (left.linkKind ?? "").localeCompare(right.linkKind ?? "")
  )
}

function toReceipt<T>(
  contribution: SettingResolutionCandidate<T>,
): SettingContributionReceipt {
  if (contribution.visibility.kind === "hidden-mandatory-policy") {
    return {
      kind: "mandatory-policy",
      policyClass: contribution.visibility.policyClass,
    }
  }
  return {
    kind: "scope",
    scopeId: contribution.scopeId,
    scopeKind: contribution.scopeKind,
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Walks an explicit, already most- to least-specific ordered tier list and
// returns the first tier with a stored record. Split out from
// resolveUserSetting so the precedence walk itself (channel wins over
// workspace wins over user) is testable independent of which tiers any given
// registry key happens to allow.
export async function resolveFromTiers(
  client: Client,
  key: SettingKey,
  userId: string,
  tiers: ReadonlyArray<{ kind: SettingScopeKind; id: string }>,
): Promise<{ record: UserSettingRecord; source: SettingScopeKind } | null> {
  for (const tier of tiers) {
    const record = await getUserSettingRecord(client, {
      userId,
      scopeKind: tier.kind,
      scopeId: tier.id,
      key,
    })
    if (record) return { record, source: tier.kind }
  }
  return null
}

// Most- to least-specific: channel → workspace → user → registered default.
// Only tiers the key's registry entry allows AND that the caller supplied an
// id for are considered.
export async function resolveUserSetting<K extends SettingKey>(
  client: Client,
  key: K,
  input: { userId: string; workspaceId?: string; channelId?: string },
): Promise<ResolvedSetting<SettingDefinition<unknown>["defaultValue"]>> {
  const definition = getSettingDefinition(key)

  const tiers: Array<{ kind: SettingScopeKind; id: string }> = []
  if (input.channelId && isScopeAllowed(key, "channel")) {
    tiers.push({ kind: "channel", id: input.channelId })
  }
  if (input.workspaceId && isScopeAllowed(key, "workspace")) {
    tiers.push({ kind: "workspace", id: input.workspaceId })
  }
  if (isScopeAllowed(key, "user")) {
    tiers.push({ kind: "user", id: "" })
  }

  const hit = await resolveFromTiers(client, key, input.userId, tiers)
  if (hit) {
    return { value: hit.record.value, source: hit.source, revision: hit.record.revision }
  }
  return { value: definition.defaultValue, source: "default", revision: null }
}

export interface SetUserSettingInput {
  userId: string
  scopeKind: SettingScopeKind
  scopeId: string
  key: SettingKey
  value: unknown
  /** Omit only when creating the record for the first time. */
  expectedRevision?: number
}

export async function setUserSetting(
  client: Client,
  input: SetUserSettingInput,
): Promise<UserSettingRecord> {
  if (!isScopeAllowed(input.key, input.scopeKind)) {
    throw new SettingScopeNotAllowedError(input.key, input.scopeKind)
  }

  const now = new Date().toISOString()
  const serialized = JSON.stringify(input.value)
  const existing = await readRow(client, {
    userId: input.userId,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    key: input.key,
  })

  if (!existing) {
    if (input.expectedRevision !== undefined) {
      // Caller believed a record already existed; it doesn't (or was
      // deleted). Treat as a conflict rather than silently creating one.
      throw new SettingRevisionConflictError(input.key)
    }
    await client.execute({
      sql: `INSERT INTO user_settings
              (id, user_id, scope_kind, scope_id, key, value, revision, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      args: [
        randomUUID(),
        input.userId,
        input.scopeKind,
        input.scopeId,
        input.key,
        serialized,
        now,
      ],
    })
    return {
      userId: input.userId,
      scopeKind: input.scopeKind,
      scopeId: input.scopeId,
      key: input.key,
      value: input.value,
      revision: 1,
      updatedAt: now,
    }
  }

  if (input.expectedRevision === undefined || input.expectedRevision !== existing.revision) {
    throw new SettingRevisionConflictError(input.key)
  }

  const result = await client.execute({
    sql: `UPDATE user_settings SET value = ?, revision = revision + 1, updated_at = ?
          WHERE user_id = ? AND scope_kind = ? AND scope_id = ? AND key = ? AND revision = ?`,
    args: [
      serialized,
      now,
      input.userId,
      input.scopeKind,
      input.scopeId,
      input.key,
      input.expectedRevision,
    ],
  })

  if (result.rowsAffected === 0) {
    // Lost a race between our read and write.
    throw new SettingRevisionConflictError(input.key)
  }

  return {
    userId: input.userId,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    key: input.key,
    value: input.value,
    revision: existing.revision + 1,
    updatedAt: now,
  }
}
