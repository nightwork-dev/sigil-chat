import { useSyncExternalStore } from "react"

import type {
  AttentionActivityEvent,
  AttentionContext,
} from "@niwork/agent/attention"
import {
  attentionHistoryKey,
  getContextDraftScope,
} from "@niwork/agent/context-draft"

const deliveredHistory = new Map<string, Set<string>>()
const revisions = new Map<string, number>()
const listeners = new Set<() => void>()

export function pendingAttentionContext(
  attention: AttentionContext | null,
  scope = getContextDraftScope(),
): AttentionContext | null {
  if (!attention) return null
  const delivered = deliveredHistory.get(scope)
  if (!delivered || delivered.size === 0) return attention
  const history = (attention.history ?? []).filter(
    (event) => !delivered.has(attentionActivityDeliveryKey(event)),
  )
  return {
    ...attention,
    history: history.length > 0 ? history : undefined,
  }
}

export function commitAttentionDelivery(
  attention: AttentionContext | null,
  scope = getContextDraftScope(),
): void {
  const delivered = new Set(
    (attention?.history ?? []).map(attentionActivityDeliveryKey),
  )
  const previous = deliveredHistory.get(scope)
  if (sameKeys(previous, delivered)) return
  deliveredHistory.set(scope, delivered)
  revisions.set(scope, (revisions.get(scope) ?? 0) + 1)
  listeners.forEach((listener) => listener())
}

export function usePendingAttentionContext(
  attention: AttentionContext | null,
): AttentionContext | null {
  const scope = getContextDraftScope()
  useSyncExternalStore(
    subscribe,
    () => revisions.get(scope) ?? 0,
    () => 0,
  )
  return pendingAttentionContext(attention, scope)
}

export function resetAttentionDeliveryForTests(): void {
  deliveredHistory.clear()
  revisions.clear()
  listeners.forEach((listener) => listener())
}

function attentionActivityDeliveryKey(event: AttentionActivityEvent): string {
  return attentionHistoryKey(event)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function sameKeys(
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string>,
): boolean {
  if ((left?.size ?? 0) !== right.size) return false
  return [...right].every((key) => left?.has(key))
}
