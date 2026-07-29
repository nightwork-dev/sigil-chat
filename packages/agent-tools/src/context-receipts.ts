import {
  agentContextReceiptProjectionHasVisibleItems,
  projectAgentContextReceiptForRoles,
  type AgentContextCompileReceipt,
  type AgentContextCompileReceiptProjection,
} from "@workspace/agent-contracts/context-receipt"

export const AGENT_CONTEXT_RECEIPT_RETENTION_POLICY =
  "sigil-chat-context-receipt-retention-v1"
export const AGENT_CONTEXT_RECEIPT_MAX_COUNT = 1_000
export const AGENT_CONTEXT_RECEIPT_MAX_BYTES = 2 * 1024 * 1024

export interface AgentContextReceiptRecord {
  applicationThreadId: string
  compiledAt: string
  principalId: string
  receipt: AgentContextCompileReceipt
  recordId: string
  retainedAt: string
  personaId?: string
  turnId?: string
}

export interface AgentContextReceiptProjectionRecord {
  applicationThreadId: string
  compiledAt: string
  principalId: string
  receipt: AgentContextCompileReceiptProjection
  recordId: string
  retainedAt: string
  personaId?: string
  turnId?: string
}

export interface AgentContextReceiptCompaction {
  compactedAt: string
  omittedReceiptCount: number
  policyVersion: typeof AGENT_CONTEXT_RECEIPT_RETENTION_POLICY
}

interface AgentContextReceiptThreadRecord {
  applicationThreadId: string
  compaction: AgentContextReceiptCompaction
  receipts: AgentContextReceiptRecord[]
}

export interface AgentContextReceiptKvStore<T> {
  delete(key: string): void
  get(key: string): T | undefined
  set(key: string, value: T): void
}

export interface AgentContextReceiptAppendInput {
  applicationThreadId: string
  principalId: string
  receipt: AgentContextCompileReceipt
  personaId?: string
  turnId?: string
}

export interface AgentContextReceiptRepository {
  append(input: AgentContextReceiptAppendInput): AgentContextReceiptRecord
  list(
    applicationThreadId: string,
    roleIds: readonly string[],
  ): AgentContextReceiptProjectionRecord[]
  purge(applicationThreadId: string): void
}

export class MirkAgentContextReceiptRepository implements AgentContextReceiptRepository {
  private readonly kv: AgentContextReceiptKvStore<AgentContextReceiptThreadRecord>
  private readonly now: () => string

  constructor(options: {
    kv: AgentContextReceiptKvStore<AgentContextReceiptThreadRecord>
    now?: () => string
  }) {
    this.kv = options.kv
    this.now = options.now ?? (() => new Date().toISOString())
  }

  append(input: AgentContextReceiptAppendInput): AgentContextReceiptRecord {
    const timestamp = this.now()
    const current = this.kv.get(key(input.applicationThreadId)) ?? {
      applicationThreadId: input.applicationThreadId,
      compaction: emptyCompaction(timestamp),
      receipts: [],
    }
    const record: AgentContextReceiptRecord = {
      applicationThreadId: input.applicationThreadId,
      compiledAt: input.receipt.compiledAt,
      principalId: input.principalId,
      receipt: input.receipt,
      recordId: `${input.receipt.id}:${timestamp}`,
      retainedAt: timestamp,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
    }
    const bounded = boundRecords([...current.receipts, record], timestamp)
    this.kv.set(key(input.applicationThreadId), {
      applicationThreadId: input.applicationThreadId,
      ...bounded,
    })
    return structuredClone(record)
  }

  list(
    applicationThreadId: string,
    roleIds: readonly string[],
  ): AgentContextReceiptProjectionRecord[] {
    const current = this.kv.get(key(applicationThreadId))
    if (!current) return []
    return current.receipts.flatMap(
      (record) => projectRecord(record, roleIds) ?? [],
    )
  }

  purge(applicationThreadId: string): void {
    this.kv.delete(key(applicationThreadId))
  }
}

export class MemoryAgentContextReceiptRepository implements AgentContextReceiptRepository {
  private readonly records = new Map<string, AgentContextReceiptThreadRecord>()
  private readonly now: () => string

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now
  }

  append(input: AgentContextReceiptAppendInput): AgentContextReceiptRecord {
    const timestamp = this.now()
    const current = this.records.get(key(input.applicationThreadId)) ?? {
      applicationThreadId: input.applicationThreadId,
      compaction: emptyCompaction(timestamp),
      receipts: [],
    }
    const record: AgentContextReceiptRecord = {
      applicationThreadId: input.applicationThreadId,
      compiledAt: input.receipt.compiledAt,
      principalId: input.principalId,
      receipt: input.receipt,
      recordId: `${input.receipt.id}:${timestamp}`,
      retainedAt: timestamp,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
    }
    this.records.set(key(input.applicationThreadId), {
      applicationThreadId: input.applicationThreadId,
      ...boundRecords([...current.receipts, record], timestamp),
    })
    return structuredClone(record)
  }

  list(
    applicationThreadId: string,
    roleIds: readonly string[],
  ): AgentContextReceiptProjectionRecord[] {
    const current = this.records.get(key(applicationThreadId))
    if (!current) return []
    return current.receipts.flatMap(
      (record) => projectRecord(record, roleIds) ?? [],
    )
  }

  purge(applicationThreadId: string): void {
    this.records.delete(key(applicationThreadId))
  }
}

function projectRecord(
  record: AgentContextReceiptRecord,
  roleIds: readonly string[],
): AgentContextReceiptProjectionRecord | null {
  const receipt = projectAgentContextReceiptForRoles(record.receipt, roleIds)
  if (!agentContextReceiptProjectionHasVisibleItems(receipt)) return null
  return {
    applicationThreadId: record.applicationThreadId,
    compiledAt: record.compiledAt,
    principalId: record.principalId,
    receipt,
    recordId: record.recordId,
    retainedAt: record.retainedAt,
    ...(record.personaId ? { personaId: record.personaId } : {}),
    ...(record.turnId ? { turnId: record.turnId } : {}),
  }
}

function boundRecords(
  records: readonly AgentContextReceiptRecord[],
  timestamp: string,
): Pick<AgentContextReceiptThreadRecord, "compaction" | "receipts"> {
  const retained: AgentContextReceiptRecord[] = []
  let retainedBytes = 0
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (retained.length >= AGENT_CONTEXT_RECEIPT_MAX_COUNT) break
    const record = records[index]
    if (!record) continue
    const bytes = serializedBytes(record)
    if (retainedBytes + bytes > AGENT_CONTEXT_RECEIPT_MAX_BYTES) break
    retained.unshift(record)
    retainedBytes += bytes
  }
  return {
    compaction: {
      compactedAt: timestamp,
      omittedReceiptCount: records.length - retained.length,
      policyVersion: AGENT_CONTEXT_RECEIPT_RETENTION_POLICY,
    },
    receipts: retained,
  }
}

function emptyCompaction(timestamp: string): AgentContextReceiptCompaction {
  return {
    compactedAt: timestamp,
    omittedReceiptCount: 0,
    policyVersion: AGENT_CONTEXT_RECEIPT_RETENTION_POLICY,
  }
}

function key(applicationThreadId: string): string {
  return `thread:${applicationThreadId}`
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}
