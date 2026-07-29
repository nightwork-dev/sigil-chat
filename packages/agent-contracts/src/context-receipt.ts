export const AGENT_CONTEXT_COMPILE_RECEIPT_EVENT =
  "sigil.context.compile-receipt"

export const AGENT_CONTEXT_COMPILE_RECEIPT_VERSION = 1

export type AgentContextReceiptAudience = "model" | "user"
export type AgentContextReceiptStatus = "ready" | "blocked"
export type AgentContextReceiptNecessity = "optional" | "required"
export type AgentContextReceiptTokenQuality =
  "fallback" | "model-aware" | "exact"

export type AgentContextVisibilityDecision =
  | {
      decision: "visible"
      reason: string
      roleIds?: readonly string[]
    }
  | {
      decision: "withheld"
      reason: string
      roleIds?: readonly string[]
    }

export interface AgentContextReceiptProvenance {
  contributorId: string
  resourceKey?: string
  revision?: string
  candidateId?: string
}

export interface AgentContextReceiptTokenEstimate {
  contentTokens?: number
  renderedTokens?: number
  estimatedTokens?: number
  quality: AgentContextReceiptTokenQuality
}

export interface AgentContextReceiptItem {
  activationReason: string
  necessity?: AgentContextReceiptNecessity
  pinned: boolean
  provenance: AgentContextReceiptProvenance
  tokenEstimate: AgentContextReceiptTokenEstimate
  visibility: AgentContextVisibilityDecision
}

export interface AgentContextReceiptSelection extends AgentContextReceiptItem {
  kind: "selected"
}

export interface AgentContextReceiptDrop extends AgentContextReceiptItem {
  dropReason: string
  kind: "dropped"
}

export interface AgentContextCompileReceipt {
  audience: AgentContextReceiptAudience
  compiledAt: string
  compiler: {
    configVersion: string
    version: string
  }
  id: string
  maxTokens: number
  pinned: readonly AgentContextReceiptItem[]
  requestId: string
  selected: readonly AgentContextReceiptSelection[]
  dropped: readonly AgentContextReceiptDrop[]
  status: AgentContextReceiptStatus
  totalTokens: number
  version: typeof AGENT_CONTEXT_COMPILE_RECEIPT_VERSION
}

export interface AgentContextCompileReceiptProjection {
  audience: AgentContextReceiptAudience
  compiledAt: string
  compiler: AgentContextCompileReceipt["compiler"]
  id: string
  maxTokens: number
  pinned: readonly AgentContextReceiptItem[]
  selected: readonly AgentContextReceiptSelection[]
  dropped: readonly AgentContextReceiptDrop[]
  status: AgentContextReceiptStatus
  totalTokens: number
  version: typeof AGENT_CONTEXT_COMPILE_RECEIPT_VERSION
}

export interface AgentContextCompileReceiptEvent {
  type: typeof AGENT_CONTEXT_COMPILE_RECEIPT_EVENT
  data: {
    applicationThreadId: string
    principalId: string
    personaId?: string
    receipt: AgentContextCompileReceiptProjection
    turnId?: string
  }
  meta?: { at: string }
}

export function projectAgentContextReceiptForRole(
  receipt: AgentContextCompileReceipt,
  roleId: string,
): AgentContextCompileReceiptProjection {
  const pinned = receipt.pinned.flatMap((item) =>
    itemVisibleToRole(item, roleId) ? [item] : [],
  )
  const selected = receipt.selected.flatMap((item) =>
    itemVisibleToRole(item, roleId) ? [item] : [],
  )
  const dropped = receipt.dropped.flatMap((item) =>
    itemVisibleToRole(item, roleId) ? [item] : [],
  )
  return {
    audience: receipt.audience,
    compiledAt: receipt.compiledAt,
    compiler: receipt.compiler,
    id: receipt.id,
    maxTokens: receipt.maxTokens,
    pinned,
    selected,
    dropped,
    status: receipt.status,
    totalTokens: visibleSelectedTokens(selected),
    version: receipt.version,
  }
}

export function projectAgentContextReceiptForRoles(
  receipt: AgentContextCompileReceipt,
  roleIds: readonly string[],
): AgentContextCompileReceiptProjection {
  const allowed = new Set(roleIds)
  const pinned = receipt.pinned.flatMap((item) =>
    itemVisibleToAnyRole(item, allowed) ? [item] : [],
  )
  const selected = receipt.selected.flatMap((item) =>
    itemVisibleToAnyRole(item, allowed) ? [item] : [],
  )
  const dropped = receipt.dropped.flatMap((item) =>
    itemVisibleToAnyRole(item, allowed) ? [item] : [],
  )
  return {
    audience: receipt.audience,
    compiledAt: receipt.compiledAt,
    compiler: receipt.compiler,
    id: receipt.id,
    maxTokens: receipt.maxTokens,
    pinned,
    selected,
    dropped,
    status: receipt.status,
    totalTokens: visibleSelectedTokens(selected),
    version: receipt.version,
  }
}

export function agentContextReceiptProjectionHasVisibleItems(
  receipt: AgentContextCompileReceiptProjection,
): boolean {
  return (
    receipt.pinned.length > 0 ||
    receipt.selected.length > 0 ||
    receipt.dropped.length > 0
  )
}

export function isAgentContextCompileReceiptEvent(
  value: unknown,
): value is AgentContextCompileReceiptEvent {
  if (!isRecord(value) || value.type !== AGENT_CONTEXT_COMPILE_RECEIPT_EVENT) {
    return false
  }
  if (!isRecord(value.data)) return false
  return (
    typeof value.data.applicationThreadId === "string" &&
    typeof value.data.principalId === "string" &&
    isAgentContextCompileReceiptProjection(value.data.receipt)
  )
}

export function isAgentContextCompileReceiptProjection(
  value: unknown,
): value is AgentContextCompileReceiptProjection {
  return (
    isRecord(value) &&
    value.version === AGENT_CONTEXT_COMPILE_RECEIPT_VERSION &&
    typeof value.id === "string" &&
    typeof value.compiledAt === "string" &&
    (value.status === "ready" || value.status === "blocked") &&
    (value.audience === "model" || value.audience === "user") &&
    typeof value.maxTokens === "number" &&
    typeof value.totalTokens === "number" &&
    isRecord(value.compiler) &&
    typeof value.compiler.version === "string" &&
    typeof value.compiler.configVersion === "string" &&
    Array.isArray(value.pinned) &&
    Array.isArray(value.selected) &&
    Array.isArray(value.dropped) &&
    value.pinned.every(isAgentContextReceiptItem) &&
    value.selected.every(isAgentContextReceiptSelection) &&
    value.dropped.every(isAgentContextReceiptDrop)
  )
}

function itemVisibleToAnyRole(
  item: AgentContextReceiptItem,
  roleIds: ReadonlySet<string>,
): boolean {
  if (item.visibility.decision === "withheld") return false
  const scoped = item.visibility.roleIds
  return scoped === undefined || scoped.some((roleId) => roleIds.has(roleId))
}

function itemVisibleToRole(
  item: AgentContextReceiptItem,
  roleId: string,
): boolean {
  return itemVisibleToAnyRole(item, new Set([roleId]))
}

function visibleSelectedTokens(
  selected: readonly AgentContextReceiptSelection[],
): number {
  return selected.reduce(
    (total, item) => total + (item.tokenEstimate.renderedTokens ?? 0),
    0,
  )
}

function isAgentContextReceiptSelection(
  value: unknown,
): value is AgentContextReceiptSelection {
  return (
    isRecord(value) &&
    value.kind === "selected" &&
    isAgentContextReceiptItem(value)
  )
}

function isAgentContextReceiptDrop(
  value: unknown,
): value is AgentContextReceiptDrop {
  return (
    isRecord(value) &&
    value.kind === "dropped" &&
    typeof value.dropReason === "string" &&
    isAgentContextReceiptItem(value)
  )
}

function isAgentContextReceiptItem(
  value: unknown,
): value is AgentContextReceiptItem {
  if (!isRecord(value)) return false
  return (
    typeof value.activationReason === "string" &&
    typeof value.pinned === "boolean" &&
    isRecord(value.provenance) &&
    typeof value.provenance.contributorId === "string" &&
    (value.provenance.resourceKey === undefined ||
      typeof value.provenance.resourceKey === "string") &&
    (value.provenance.revision === undefined ||
      typeof value.provenance.revision === "string") &&
    (value.provenance.candidateId === undefined ||
      typeof value.provenance.candidateId === "string") &&
    isRecord(value.tokenEstimate) &&
    isTokenQuality(value.tokenEstimate.quality) &&
    isVisibility(value.visibility)
  )
}

function isVisibility(value: unknown): value is AgentContextVisibilityDecision {
  return (
    isRecord(value) &&
    (value.decision === "visible" || value.decision === "withheld") &&
    typeof value.reason === "string" &&
    (value.roleIds === undefined ||
      (Array.isArray(value.roleIds) &&
        value.roleIds.every((roleId) => typeof roleId === "string")))
  )
}

function isTokenQuality(
  value: unknown,
): value is AgentContextReceiptTokenQuality {
  return value === "fallback" || value === "model-aware" || value === "exact"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
