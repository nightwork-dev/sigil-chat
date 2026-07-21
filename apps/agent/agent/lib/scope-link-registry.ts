import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

import {
  type ScopeLink,
  type ScopeLinkKind,
  sortScopeLinks,
  wouldCreateScopeLinkCycle,
} from "./scope-graph"
import type { ScopeRecord } from "./scope-registry"

const LINK_NAMESPACE = "sigil-chat.scope-links.v1"
const AUDIT_NAMESPACE = "sigil-chat.scope-link-audit.v1"

export type ScopeLinkAuditAction = "created" | "updated" | "removed"

export interface ScopeLinkAuditRecord {
  readonly id: string
  readonly linkId: string
  readonly action: ScopeLinkAuditAction
  readonly actorId: string
  readonly at: string
  readonly revision: number
  readonly before?: ScopeLink
  readonly after?: ScopeLink
}

export interface ScopeLinkScopeLookup {
  get(id: string): ScopeRecord | undefined
}

export interface ScopeLinkRegistryOptions {
  cwd?: string
  projectRoot?: string
  scopes: ScopeLinkScopeLookup
  links?: KvStore<unknown>
  audit?: KvStore<unknown>
  now?: () => Date
  createId?: () => string
}

export interface CreateScopeLinkInput {
  readonly kind: ScopeLinkKind
  readonly subjectScopeId: string
  readonly targetScopeId: string
  readonly order: number
  readonly createdBy: string
}

export interface UpdateScopeLinkInput {
  readonly kind?: ScopeLinkKind
  readonly subjectScopeId?: string
  readonly targetScopeId?: string
  readonly order?: number
  readonly actorId: string
  readonly expectedRevision: number
}

export class ScopeLinkConflictError extends Error {
  constructor(
    readonly linkId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Scope link ${linkId} changed from revision ${expectedRevision} to ${actualRevision}.`,
    )
  }
}

/**
 * Mirk-backed composition records. It owns neither scope lifecycle nor
 * authorization: it verifies that both endpoint records exist, then records
 * the requested non-authorizing relationship and its audit trail.
 */
export class ScopeLinkRegistry {
  private readonly links: KvStore<unknown>
  private readonly audit: KvStore<unknown>
  private readonly now: () => Date
  private readonly createId: () => string

  constructor(private readonly options: ScopeLinkRegistryOptions) {
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    if (options.links && options.audit) {
      this.links = options.links
      this.audit = options.audit
      return
    }

    const scope = createScope({
      cwd: options.cwd ?? process.cwd(),
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.links = options.links ?? provider.kv("project", LINK_NAMESPACE)
    this.audit = options.audit ?? provider.kv("project", AUDIT_NAMESPACE)
  }

  get(id: string): ScopeLink | undefined {
    assertIdentifier("id", id)
    const value = this.links.get(id)
    if (value === undefined) return undefined
    if (!isScopeLink(value) || value.id !== id) {
      throw new Error(`Scope link registry is corrupt for ${id}.`)
    }
    return clone(value)
  }

  list(kind?: ScopeLinkKind): ScopeLink[] {
    return sortScopeLinks(
      this.links.entries().map(({ key, value }) => {
        if (!isScopeLink(value) || value.id !== key) {
          throw new Error(`Scope link registry is corrupt for ${key}.`)
        }
        return clone(value)
      }).filter((link) => kind === undefined || link.kind === kind),
    )
  }

  create(input: CreateScopeLinkInput): ScopeLink {
    assertCreateInput(input)
    this.assertKnownScopes(input.subjectScopeId, input.targetScopeId)
    const existing = this.list()
    if (
      wouldCreateScopeLinkCycle(
        input,
        existing,
      )
    ) {
      throw new Error("Scope link would create a cycle for this relation.")
    }
    const createdAt = this.now().toISOString()
    const link: ScopeLink = {
      id: this.createId(),
      kind: input.kind,
      subjectScopeId: input.subjectScopeId,
      targetScopeId: input.targetScopeId,
      order: input.order,
      createdAt,
      createdBy: input.createdBy,
      revision: 1,
    }
    assertScopeLink(link)
    this.links.set(link.id, clone(link))
    this.writeAudit({
      linkId: link.id,
      action: "created",
      actorId: input.createdBy,
      at: createdAt,
      revision: link.revision,
      after: link,
    })
    return clone(link)
  }

  update(id: string, input: UpdateScopeLinkInput): ScopeLink {
    const current = this.require(id)
    if (current.revision !== input.expectedRevision) {
      throw new ScopeLinkConflictError(
        current.id,
        input.expectedRevision,
        current.revision,
      )
    }
    const next: ScopeLink = {
      ...current,
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.subjectScopeId === undefined
        ? {}
        : { subjectScopeId: input.subjectScopeId }),
      ...(input.targetScopeId === undefined
        ? {}
        : { targetScopeId: input.targetScopeId }),
      ...(input.order === undefined ? {} : { order: input.order }),
      revision: current.revision + 1,
    }
    assertScopeLink(next)
    assertIdentifier("actor id", input.actorId)
    this.assertKnownScopes(next.subjectScopeId, next.targetScopeId)
    if (
      wouldCreateScopeLinkCycle(
        next,
        this.list().filter((link) => link.id !== current.id),
      )
    ) {
      throw new Error("Scope link would create a cycle for this relation.")
    }
    const at = this.now().toISOString()
    this.links.set(next.id, clone(next))
    this.writeAudit({
      linkId: next.id,
      action: "updated",
      actorId: input.actorId,
      at,
      revision: next.revision,
      before: current,
      after: next,
    })
    return clone(next)
  }

  reorder(
    id: string,
    order: number,
    actorId: string,
    expectedRevision: number,
  ): ScopeLink {
    return this.update(id, { order, actorId, expectedRevision })
  }

  remove(id: string, actorId: string, expectedRevision: number): ScopeLink {
    const current = this.require(id)
    assertIdentifier("actor id", actorId)
    if (current.revision !== expectedRevision) {
      throw new ScopeLinkConflictError(id, expectedRevision, current.revision)
    }
    this.links.delete(id)
    this.writeAudit({
      linkId: current.id,
      action: "removed",
      actorId,
      at: this.now().toISOString(),
      revision: current.revision,
      before: current,
    })
    return current
  }

  listAudit(linkId?: string): ScopeLinkAuditRecord[] {
    if (linkId !== undefined) assertIdentifier("link id", linkId)
    return this.audit.entries().map(({ key, value }) => {
      if (!isScopeLinkAuditRecord(value) || value.id !== key) {
        throw new Error(`Scope link audit registry is corrupt for ${key}.`)
      }
      return clone(value)
    }).filter((record) => linkId === undefined || record.linkId === linkId)
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id))
  }

  private require(id: string): ScopeLink {
    const link = this.get(id)
    if (!link) throw new Error(`Scope link ${id} was not found.`)
    return link
  }

  private assertKnownScopes(subjectScopeId: string, targetScopeId: string): void {
    if (!this.options.scopes.get(subjectScopeId)) {
      throw new Error(`Unknown subject scope id: ${subjectScopeId}.`)
    }
    if (!this.options.scopes.get(targetScopeId)) {
      throw new Error(`Unknown target scope id: ${targetScopeId}.`)
    }
  }

  private writeAudit(
    input: Omit<ScopeLinkAuditRecord, "id">,
  ): ScopeLinkAuditRecord {
    const record: ScopeLinkAuditRecord = { id: this.createId(), ...input }
    assertScopeLinkAuditRecord(record)
    this.audit.set(record.id, clone(record))
    return clone(record)
  }
}

export function isScopeLink(value: unknown): value is ScopeLink {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, scopeLinkKeys) &&
    isIdentifier(value.id) &&
    isScopeLinkKind(value.kind) &&
    isIdentifier(value.subjectScopeId) &&
    isIdentifier(value.targetScopeId) &&
    isOrder(value.order) &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy) &&
    isRevision(value.revision)
  )
}

function isScopeLinkAuditRecord(value: unknown): value is ScopeLinkAuditRecord {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, scopeLinkAuditKeys) &&
    isIdentifier(value.id) &&
    isIdentifier(value.linkId) &&
    (value.action === "created" || value.action === "updated" || value.action === "removed") &&
    isIdentifier(value.actorId) &&
    isIdentifier(value.at) &&
    isRevision(value.revision) &&
    (value.before === undefined || isScopeLink(value.before)) &&
    (value.after === undefined || isScopeLink(value.after))
  )
}

const scopeLinkKeys = [
  "id",
  "kind",
  "subjectScopeId",
  "targetScopeId",
  "order",
  "createdAt",
  "createdBy",
  "revision",
] as const

const scopeLinkAuditKeys = [
  "id",
  "linkId",
  "action",
  "actorId",
  "at",
  "revision",
  "before",
  "after",
] as const

function assertCreateInput(input: CreateScopeLinkInput): void {
  if (!isScopeLinkKind(input.kind)) throw new Error("Scope link kind is invalid.")
  assertIdentifier("subject scope id", input.subjectScopeId)
  assertIdentifier("target scope id", input.targetScopeId)
  if (!isOrder(input.order)) throw new Error("Scope link order is invalid.")
  assertIdentifier("creator id", input.createdBy)
}

function assertScopeLink(value: ScopeLink): asserts value is ScopeLink {
  if (!isScopeLink(value)) throw new Error("Scope link is invalid.")
}

function assertScopeLinkAuditRecord(
  value: ScopeLinkAuditRecord,
): asserts value is ScopeLinkAuditRecord {
  if (!isScopeLinkAuditRecord(value)) throw new Error("Scope link audit record is invalid.")
}

function isScopeLinkKind(value: unknown): value is ScopeLinkKind {
  return (
    value === "mounted-in" ||
    value === "contributes-defaults" ||
    value === "rolls-up-to" ||
    value === "discoverable-from"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value)) throw new Error(`Scope link ${label} must be non-empty.`)
}

function isOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
