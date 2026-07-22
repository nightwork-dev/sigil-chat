import { randomUUID } from "node:crypto"
import type { Client } from "@libsql/client"
import { verifyPassword } from "better-auth/crypto"
import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { readGonkClientEnvironment } from "@workspace/runtime-env/server"

import {
  getAuth,
  getAuthDbClient,
  type SigilAuthInstance,
  type SigilAuthSession,
} from "./auth/server"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import { requireSession } from "./auth/session"

const SIGIL_SCOPE_HEADER = "x-sigil-scope"
const EXTERNAL_MCP_POLICY_VERSION = 1
const DEFAULT_EXPIRY_DAYS = 90
const MAX_EXPIRY_DAYS = 365
const KEY_RATE_LIMIT_WINDOW_MS = 60 * 1000
const KEY_RATE_LIMIT_MAX = 120
const MAX_BODY_BYTES = 1024 * 1024
const STEP_UP_RECEIPT_WINDOW_MS = 5 * 60 * 1000
const MAX_ACTIVE_KEYS_PER_USER = 20
const MAX_INVALID_AUTH_ATTEMPTS_PER_MINUTE = 30
const MAX_ACTIVE_MCP_SESSIONS = 100
const MAX_ACTIVE_MCP_SESSIONS_PER_CREDENTIAL = 4

type ExternalMcpOperation = "read" | "write"
type ExternalMcpProfile = "observer" | "collaborator"

interface ApiKeyPlugin {
  createApiKey(input: { body: Record<string, unknown> }): Promise<ApiKeyRow>
  updateApiKey(input: { body: Record<string, unknown> }): Promise<ApiKeyRow>
  verifyApiKey(input: {
    body: { configId?: string; key: string }
  }): Promise<{ valid: boolean; key: ApiKeyRow | null; error?: unknown }>
}

interface ApiKeyRow {
  createdAt: Date | string
  enabled?: boolean | number | null
  expiresAt?: Date | string | null
  id: string
  key?: string
  lastRequest?: Date | string | null
  name?: string | null
  prefix?: string | null
  referenceId: string
  start?: string | null
}

interface GrantRow {
  credentialId: string
  createdAt: string
  keySuffix: string
  operation: ExternalMcpOperation
  policyVersion: number
  principalId: string
  profile: ExternalMcpProfile
  resourceScope: string
  revokedAt?: string
  toolAllowlist: string[]
  updatedAt: string
}

interface VerifiedCredential {
  grant: GrantRow
  key: ApiKeyRow
  safeStart: string
}

type ResourceAuthorizer = (input: {
  operation: ExternalMcpOperation
  principalId: string
  resourceScope: string
}) => boolean

export interface ExternalMcpKeyCreateInput {
  expiresInDays?: number
  name: string
  operation?: ExternalMcpOperation
  profile?: ExternalMcpProfile
  resourceScope: string
  toolAllowlist?: string[]
}

export interface ExternalMcpKeySummary {
  createdAt: string
  expiresAt?: string
  id: string
  lastUsedAt?: string
  name: string
  operation: ExternalMcpOperation
  profile: ExternalMcpProfile
  resourceScope: string
  revokedAt?: string
  safeStart: string
  safeSuffix: string
  toolAllowlist: string[]
}

export interface CreatedExternalMcpKey {
  key: string
  summary: ExternalMcpKeySummary
}

export interface ExternalMcpStepUpReceipt {
  receipt: string
}

export class ExternalMcpAuthError extends Error {
  readonly status = 401
  readonly code = "invalid_token"
}

export class ExternalMcpForbiddenError extends Error {
  readonly status = 403
  constructor(message = "External MCP credential is not authorized.") {
    super(message)
    this.name = "ExternalMcpForbiddenError"
  }
}

export class ExternalMcpRateLimitError extends Error {
  readonly status = 429
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super("External MCP credential exceeded its rate limit.")
    this.name = "ExternalMcpRateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const externalToolPolicy = {
  observer: {
    operation: "read",
    tools: ["sigil-spec-list", "sigil-spec-inspect", "sigil-story-list", "sigil-story-inspect"],
  },
  collaborator: {
    operation: "write",
    tools: [
      "sigil-spec-list",
      "sigil-spec-inspect",
      "sigil-spec-create",
      "sigil-spec-revise",
      "sigil-spec-transition",
      "sigil-story-list",
      "sigil-story-inspect",
      "sigil-story-comment",
    ],
  },
} as const

const writeTools = new Set([
  "sigil-spec-create",
  "sigil-spec-revise",
  "sigil-spec-transition",
  "sigil-story-comment",
])

const mcpSessionBindings = new Map<
  string,
  {
    credentialId: string
    principalId: string
    resourceScope: string
    securityContextKey: string
  }
>()
const mcpSessionReservations = new Map<string, { credentialId: string }>()
const invalidAuthBuckets = new Map<string, { count: number; windowStart: number }>()
const stepUpReceipts = new Map<
  string,
  {
    expiresAt: number
    sessionId: string
    userId: string
  }
>()

export function resetExternalMcpGatewayStateForTests() {
  invalidAuthBuckets.clear()
  mcpSessionBindings.clear()
  mcpSessionReservations.clear()
  stepUpReceipts.clear()
}

export class ExternalMcpCredentialService {
  constructor(
    private readonly options: {
      auth?: SigilAuthInstance
      client: Client
      now?: () => Date
      resourceAuthorizer?: ResourceAuthorizer
    },
  ) {}

  async create(
    session: SigilAuthSession | null,
    input: ExternalMcpKeyCreateInput,
    stepUpReceipt?: string,
  ): Promise<CreatedExternalMcpKey> {
    requireSession(session)
    this.consumeStepUpReceipt(session, stepUpReceipt)
    const normalized = normalizeCreateInput(input)
    return this.createAuthorizedKey(session, normalized)
  }

  async issueStepUpReceipt(
    session: SigilAuthSession | null,
    password: string,
  ): Promise<ExternalMcpStepUpReceipt> {
    requireSession(session)
    await this.verifyPasswordReauthentication(session, password)
    const receipt = randomUUID()
    stepUpReceipts.set(receipt, {
      expiresAt: this.now().getTime() + STEP_UP_RECEIPT_WINDOW_MS,
      sessionId: session.session.id,
      userId: session.user.id,
    })
    return { receipt }
  }

  private async createAuthorizedKey(
    session: SigilAuthSession,
    normalized: ReturnType<typeof normalizeCreateInput>,
  ): Promise<CreatedExternalMcpKey> {
    this.requireResourceAccess({
      operation: normalized.operation,
      principalId: session.user.id,
      resourceScope: normalized.resourceScope,
    })
    await this.requireActiveKeyCapacity(session.user.id)
    const auth = this.plugin()
    const created = await auth.createApiKey({
      body: {
        expiresIn: normalized.expiresInDays * 24 * 60 * 60,
        metadata: {
          externalMcp: {
            operation: normalized.operation,
            profile: normalized.profile,
            resourceScope: normalized.resourceScope,
          },
        },
        name: normalized.name,
        prefix: "sigil_live_",
        rateLimitEnabled: true,
        rateLimitMax: KEY_RATE_LIMIT_MAX,
        rateLimitTimeWindow: KEY_RATE_LIMIT_WINDOW_MS,
        userId: session.user.id,
      },
    })
    if (!created.key) throw new Error("Better Auth did not return an API key.")

    const grant = await this.insertGrant({
      credentialId: created.id,
      keySuffix: created.key.slice(-4),
      operation: normalized.operation,
      principalId: session.user.id,
      profile: normalized.profile,
      resourceScope: normalized.resourceScope,
      toolAllowlist: normalized.toolAllowlist,
    })

    return { key: created.key, summary: summarizeKey(created, grant) }
  }

  async list(session: SigilAuthSession | null): Promise<ExternalMcpKeySummary[]> {
    requireSession(session)
    const result = await this.options.client.execute({
      sql: `
        SELECT
          apikey.id, apikey.name, apikey.start, apikey.createdAt, apikey.expiresAt,
          apikey.lastRequest, external_mcp_grant.resource_scope,
          external_mcp_grant.tool_allowlist, external_mcp_grant.operation,
          external_mcp_grant.profile, external_mcp_grant.key_suffix,
          external_mcp_grant.policy_version, external_mcp_grant.created_at,
          external_mcp_grant.updated_at, external_mcp_grant.revoked_at
        FROM apikey
        JOIN external_mcp_grant
          ON external_mcp_grant.credential_id = apikey.id
        WHERE apikey.referenceId = ?
        ORDER BY apikey.createdAt DESC
      `,
      args: [session.user.id],
    })
    return result.rows.map((row) =>
      summarizeKey(
        {
          createdAt: row.createdAt as string,
          expiresAt: (row.expiresAt as string | null) ?? null,
          id: row.id as string,
          lastRequest: (row.lastRequest as string | null) ?? null,
          name: row.name as string,
          referenceId: session.user.id,
          start: row.start as string,
        },
        grantRow(row),
      ),
    )
  }

  async replace(
    session: SigilAuthSession | null,
    credentialId: string,
    stepUpReceipt?: string,
  ): Promise<CreatedExternalMcpKey> {
    requireSession(session)
    this.consumeStepUpReceipt(session, stepUpReceipt)
    const existing = await this.loadOwnedGrant(credentialId, session.user.id)
    const created = await this.createAuthorizedKey(
      session,
      normalizeCreateInput({
        name: `Replacement for ${credentialId}`,
        operation: existing.operation,
        profile: existing.profile,
        resourceScope: existing.resourceScope,
        toolAllowlist: existing.toolAllowlist,
      }),
    )
    await this.revokeAuthorizedKey(session, credentialId, "replaced")
    return created
  }

  async revoke(
    session: SigilAuthSession | null,
    credentialId: string,
    stepUpReceipt?: string,
    reason = "revoked",
  ): Promise<void> {
    requireSession(session)
    this.consumeStepUpReceipt(session, stepUpReceipt)
    await this.revokeAuthorizedKey(session, credentialId, reason)
  }

  private async revokeAuthorizedKey(
    session: SigilAuthSession,
    credentialId: string,
    reason: string,
  ): Promise<void> {
    await this.loadOwnedGrant(credentialId, session.user.id)
    await this.plugin().updateApiKey({
      body: { enabled: false, keyId: credentialId, userId: session.user.id },
    })
    const timestamp = this.now().toISOString()
    await this.options.client.execute({
      sql: `
        UPDATE external_mcp_grant
        SET revoked_at = ?, revocation_reason = ?, updated_at = ?
        WHERE credential_id = ? AND principal_id = ?
      `,
      args: [timestamp, reason, timestamp, credentialId, session.user.id],
    })
    for (const [sessionId, binding] of mcpSessionBindings) {
      if (binding.credentialId === credentialId) mcpSessionBindings.delete(sessionId)
    }
  }

  async verifyRawKey(rawKey: string): Promise<VerifiedCredential> {
    const result = await this.plugin().verifyApiKey({ body: { key: rawKey } })
    if (!result.valid || !result.key) {
      const retryAfterMs = readRateLimitRetryAfter(result.error)
      if (retryAfterMs !== undefined) {
        throw new ExternalMcpRateLimitError(Math.max(1, Math.ceil(retryAfterMs / 1000)))
      }
      throw new ExternalMcpAuthError()
    }
    if (!result.key.enabled) throw new ExternalMcpAuthError()
    if (
      result.key.expiresAt &&
      new Date(result.key.expiresAt).getTime() <= this.now().getTime()
    ) {
      throw new ExternalMcpAuthError()
    }
    const grant = await this.loadOwnedGrant(result.key.id, result.key.referenceId)
    if (grant.revokedAt) throw new ExternalMcpAuthError()
    await this.requireActivePrincipal(grant.principalId)
    this.requireResourceAccess({
      operation: grant.operation,
      principalId: grant.principalId,
      resourceScope: grant.resourceScope,
    })
    return {
      grant,
      key: result.key,
      safeStart: result.key.start ?? result.key.prefix ?? "sigil_live_",
    }
  }

  async insertGrant(input: {
    credentialId: string
    keySuffix: string
    operation: ExternalMcpOperation
    principalId: string
    profile: ExternalMcpProfile
    resourceScope: string
    toolAllowlist: string[]
  }): Promise<GrantRow> {
    const timestamp = this.now().toISOString()
    await this.options.client.execute({
      sql: `
        INSERT INTO external_mcp_grant (
          credential_id, principal_id, resource_scope, tool_allowlist,
          operation, profile, key_suffix, policy_version, created_by_user_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        input.credentialId,
        input.principalId,
        input.resourceScope,
        JSON.stringify(input.toolAllowlist),
        input.operation,
        input.profile,
        input.keySuffix,
        EXTERNAL_MCP_POLICY_VERSION,
        input.principalId,
        timestamp,
        timestamp,
      ],
    })
    return {
      credentialId: input.credentialId,
      createdAt: timestamp,
      keySuffix: input.keySuffix,
      operation: input.operation,
      policyVersion: EXTERNAL_MCP_POLICY_VERSION,
      principalId: input.principalId,
      profile: input.profile,
      resourceScope: input.resourceScope,
      toolAllowlist: input.toolAllowlist,
      updatedAt: timestamp,
    }
  }

  async audit(input: {
    credentialId?: string
    latencyMs: number
    mcpMethod: string
    operation?: ExternalMcpOperation
    outcome: "allow" | "deny"
    policyVersion?: number
    principalId?: string
    reason: string
    resourceScope?: string
    safeStart?: string
    toolName?: string
  }): Promise<void> {
    await this.options.client.execute({
      sql: `
        INSERT INTO external_mcp_audit (
          id, credential_id, credential_start, principal_id, mcp_method,
          tool_name, resource_scope, operation, policy_version, outcome,
          reason, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        randomUUID(),
        input.credentialId ?? null,
        input.safeStart ?? null,
        input.principalId ?? null,
        input.mcpMethod,
        input.toolName ?? null,
        input.resourceScope ?? null,
        input.operation ?? null,
        input.policyVersion ?? null,
        input.outcome,
        input.reason,
        input.latencyMs,
        this.now().toISOString(),
      ],
    })
  }

  private async loadOwnedGrant(
    credentialId: string,
    principalId: string,
  ): Promise<GrantRow> {
    const result = await this.options.client.execute({
      sql: `
        SELECT *
        FROM external_mcp_grant
        WHERE credential_id = ? AND principal_id = ?
        LIMIT 1
      `,
      args: [credentialId, principalId],
    })
    const row = result.rows[0]
    if (!row) throw new ExternalMcpForbiddenError()
    return grantRow(row)
  }

  private consumeStepUpReceipt(
    session: SigilAuthSession,
    receipt: string | undefined,
  ): void {
    if (!receipt) {
      throw new ExternalMcpForbiddenError("Step-up reauthentication is required.")
    }
    const stored = stepUpReceipts.get(receipt)
    stepUpReceipts.delete(receipt)
    if (
      !stored ||
      stored.userId !== session.user.id ||
      stored.sessionId !== session.session.id ||
      stored.expiresAt <= this.now().getTime()
    ) {
      throw new ExternalMcpForbiddenError("Step-up reauthentication is required.")
    }
  }

  private async verifyPasswordReauthentication(
    session: SigilAuthSession,
    password: string,
  ): Promise<void> {
    const result = await this.options.client.execute({
      sql: `
        SELECT account.password, session.expiresAt
        FROM session
        JOIN account
          ON account.userId = session.userId
        WHERE session.id = ?
          AND session.userId = ?
          AND account.providerId = 'credential'
          AND account.password IS NOT NULL
        LIMIT 1
      `,
      args: [session.session.id, session.user.id],
    })
    const row = result.rows[0]
    if (!row) throw new ExternalMcpAuthError()
    const now = this.now().getTime()
    const expiresAt = new Date(String(row.expiresAt)).getTime()
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    ) {
      throw new ExternalMcpAuthError()
    }
    const verified = await verifyPassword({
      hash: String(row.password),
      password,
    })
    if (!verified) {
      throw new ExternalMcpForbiddenError("Step-up reauthentication is required.")
    }
  }

  private async requireActiveKeyCapacity(principalId: string): Promise<void> {
    const result = await this.options.client.execute({
      sql: `
        SELECT COUNT(*) AS count
        FROM apikey
        JOIN external_mcp_grant
          ON external_mcp_grant.credential_id = apikey.id
        WHERE apikey.referenceId = ?
          AND apikey.enabled = 1
          AND external_mcp_grant.revoked_at IS NULL
          AND (apikey.expiresAt IS NULL OR apikey.expiresAt > ?)
      `,
      args: [principalId, this.now().toISOString()],
    })
    if (Number(result.rows[0]?.count ?? 0) >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new ExternalMcpForbiddenError("External MCP active key limit reached.")
    }
  }

  private async requireActivePrincipal(principalId: string): Promise<void> {
    const result = await this.options.client.execute({
      sql: "SELECT 1 FROM user WHERE id = ? LIMIT 1",
      args: [principalId],
    })
    if (result.rows.length === 0) throw new ExternalMcpAuthError()
  }

  private requireResourceAccess(input: {
    operation: ExternalMcpOperation
    principalId: string
    resourceScope: string
  }): void {
    const authorizer = this.options.resourceAuthorizer ?? defaultResourceAuthorizer
    if (!authorizer(input)) {
      throw new ExternalMcpForbiddenError("Resource scope is not authorized.")
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private plugin(): ApiKeyPlugin {
    return ((this.options.auth ?? undefined)?.api ??
      {}) as unknown as ApiKeyPlugin
  }
}

export async function createDefaultExternalMcpCredentialService() {
  return new ExternalMcpCredentialService({
    auth: await getAuth(),
    client: await getAuthDbClient(),
  })
}

export async function handleExternalMcpRequest(
  request: Request,
  options: {
    credentialService?: ExternalMcpCredentialService
    fetcher?: typeof fetch
    gonkMcpUrl?: string
    gonkServiceBearer?: string
    now?: () => Date
    trustedOrigins?: readonly string[]
  } = {},
): Promise<Response> {
  const started = Date.now()
  const method = request.method.toUpperCase()
  const service =
    options.credentialService ?? (await createDefaultExternalMcpCredentialService())
  let verified: VerifiedCredential | undefined
  let mcpMethod = method === "POST" ? "unknown" : method
  let sessionReservationId: string | undefined
  let toolName: string | undefined

  try {
    validateOrigin(request, options.trustedOrigins)
    rejectCookies(request)
    enforceInvalidAuthBudget(request)
    const rawKey = extractBearer(request)
    if (hasCredentialInUnsafePlace(request)) throw new ExternalMcpAuthError()
    const body =
      method === "POST" ? await readRequestBody(request, MAX_BODY_BYTES) : undefined
    const rpc = body ? readJsonRpc(body) : undefined
    if (rpc?.hasCredentialLikeData) throw new ExternalMcpAuthError()
    verified = await service.verifyRawKey(rawKey)
    if (rpc?.method) mcpMethod = rpc.method
    if (rpc?.method === "tools/call") toolName = rpc.toolName

    authorizeMcpRequest({
      method,
      rpc,
      requestedScope:
        request.headers.get(SIGIL_SCOPE_HEADER) ??
        rpc?.requestedResourceScope,
      verified,
      sessionId: request.headers.get("mcp-session-id") ?? undefined,
    })

    sessionReservationId = reserveMcpSessionCapacity(rpc, verified)
    const upstream = await proxyToGonk(request, body, verified, options)
    const response =
      rpc?.method === "tools/list"
        ? await filterToolList(upstream, verified)
        : upstream
    bindSession(response, verified, sessionReservationId)
    sessionReservationId = undefined
    await auditDecision(service, {
      credentialId: verified.key.id,
      latencyMs: Date.now() - started,
      mcpMethod,
      operation: toolName ? operationForTool(toolName) : undefined,
      outcome: "allow",
      policyVersion: verified.grant.policyVersion,
      principalId: verified.grant.principalId,
      reason: "allowed",
      resourceScope: verified.grant.resourceScope,
      safeStart: verified.safeStart,
      toolName,
    })
    return response
  } catch (error) {
    if (sessionReservationId) releaseMcpSessionReservation(sessionReservationId)
    const status = statusFor(error)
    if (status === 401) recordInvalidAuthFailure(request)
    await auditDecision(service, {
      credentialId: verified?.key.id,
      latencyMs: Date.now() - started,
      mcpMethod,
      operation: toolName ? operationForTool(toolName) : undefined,
      outcome: "deny",
      policyVersion: verified?.grant.policyVersion,
      principalId: verified?.grant.principalId,
      reason: reasonFor(error),
      resourceScope: verified?.grant.resourceScope,
      safeStart: verified?.safeStart,
      toolName,
    })
    return errorResponse(status, reasonFor(error), error)
  }
}

async function proxyToGonk(
  original: Request,
  body: Uint8Array | undefined,
  verified: VerifiedCredential,
  options: {
    fetcher?: typeof fetch
    gonkMcpUrl?: string
    gonkServiceBearer?: string
    now?: () => Date
  },
): Promise<Response> {
  const environment = readGonkClientEnvironment(process.env)
  const bearer = options.gonkServiceBearer ?? environment.apiKey
  if (!bearer) throw new Error("GONK_MCP_KEY is not configured.")
  const url = options.gonkMcpUrl ?? environment.gonkMcpUrl
  const headers = new Headers(original.headers)
  headers.set("authorization", `Bearer ${bearer}`)
  headers.set(SIGIL_SCOPE_HEADER, verified.grant.resourceScope)
  headers.set(
    AGENT_SCOPE_PROOF_HEADER,
    issueScopeDelegation(
      {
        expiresAt: Math.floor((options.now?.() ?? new Date()).getTime() / 1000) + 60,
        scope: verified.grant.resourceScope,
        subject: verified.grant.principalId,
      },
      bearer,
    ),
  )
  headers.delete("content-length")

  return (options.fetcher ?? fetch)(url, {
    body:
      original.method === "GET" || original.method === "HEAD"
        ? undefined
        : body
          ? bodyToArrayBuffer(body)
          : undefined,
    headers,
    method: original.method,
  })
}

function bodyToArrayBuffer(body: Uint8Array): ArrayBuffer {
  return body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer
}

function authorizeMcpRequest(input: {
  method: string
  rpc: JsonRpcRequest | undefined
  requestedScope: string | undefined
  sessionId: string | undefined
  verified: VerifiedCredential
}) {
  if (
    input.requestedScope !== undefined &&
    input.requestedScope !== input.verified.grant.resourceScope
  ) {
    throw new ExternalMcpForbiddenError("Requested scope is outside this credential grant.")
  }
  const binding = input.sessionId ? mcpSessionBindings.get(input.sessionId) : undefined
  if (
    binding &&
    binding.securityContextKey !== securityContextKey(input.verified)
  ) {
    mcpSessionBindings.delete(input.sessionId!)
    throw new ExternalMcpForbiddenError("MCP session is bound to another credential.")
  }
  if (input.method === "DELETE") return
  if (input.method !== "POST") throw new ExternalMcpForbiddenError()
  if (!input.rpc) throw new ExternalMcpForbiddenError("Invalid MCP JSON-RPC request.")
  if (input.rpc.method === "tools/call") {
    if (!input.rpc.toolName) throw new ExternalMcpForbiddenError("Missing tool name.")
    assertToolAllowed(input.verified.grant, input.rpc.toolName)
  }
}

async function filterToolList(
  response: Response,
  verified: VerifiedCredential,
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("text/event-stream")) {
    const headers = new Headers(response.headers)
    headers.delete("content-length")
    return new Response(
      filterToolListSse(await response.text(), verified),
      {
        headers,
        status: response.status,
        statusText: response.statusText,
      },
    )
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Gonk returned an unsupported tools/list response.")
  }
  const payload = await response.json()
  if (isRecord(payload) && isRecord(payload.result) && Array.isArray(payload.result.tools)) {
    payload.result.tools = payload.result.tools.filter(
      (tool) =>
        isRecord(tool) &&
        typeof tool.name === "string" &&
        isToolAllowed(verified.grant, tool.name),
    )
  }
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return new Response(JSON.stringify(payload), {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function filterToolListSse(text: string, verified: VerifiedCredential): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.startsWith("data:")) return line
      const prefix = "data:"
      const json = line.slice(prefix.length).trimStart()
      if (json === "[DONE]") return line
      try {
        const payload = JSON.parse(json)
        if (
          isRecord(payload) &&
          isRecord(payload.result) &&
          Array.isArray(payload.result.tools)
        ) {
          payload.result.tools = payload.result.tools.filter(
            (tool) =>
              isRecord(tool) &&
              typeof tool.name === "string" &&
              isToolAllowed(verified.grant, tool.name),
          )
        }
        return `${prefix} ${JSON.stringify(payload)}`
      } catch {
        return line
      }
    })
    .join("\n")
}

function reserveMcpSessionCapacity(
  rpc: JsonRpcRequest | undefined,
  verified: VerifiedCredential,
): string | undefined {
  if (rpc?.method !== "initialize") return undefined
  const activeForCredential = [...mcpSessionBindings.values()].filter(
    (binding) => binding.credentialId === verified.key.id,
  ).length
  const reservedForCredential = [...mcpSessionReservations.values()].filter(
    (reservation) => reservation.credentialId === verified.key.id,
  ).length
  if (
    mcpSessionBindings.size + mcpSessionReservations.size >=
      MAX_ACTIVE_MCP_SESSIONS ||
    activeForCredential + reservedForCredential >=
      MAX_ACTIVE_MCP_SESSIONS_PER_CREDENTIAL
  ) {
    throw new ExternalMcpRateLimitError(60)
  }
  const reservationId = randomUUID()
  mcpSessionReservations.set(reservationId, { credentialId: verified.key.id })
  return reservationId
}

function releaseMcpSessionReservation(reservationId: string) {
  mcpSessionReservations.delete(reservationId)
}

function bindSession(
  response: Response,
  verified: VerifiedCredential,
  reservationId: string | undefined,
) {
  const sessionId = response.headers.get("mcp-session-id")
  if (!response.ok || !sessionId) {
    if (reservationId) releaseMcpSessionReservation(reservationId)
    return
  }
  const existing = mcpSessionBindings.get(sessionId)
  if (existing && reservationId) releaseMcpSessionReservation(reservationId)
  mcpSessionBindings.set(sessionId, {
    credentialId: verified.key.id,
    principalId: verified.grant.principalId,
    resourceScope: verified.grant.resourceScope,
    securityContextKey: securityContextKey(verified),
  })
  if (!existing && reservationId) releaseMcpSessionReservation(reservationId)
}

async function auditDecision(
  service: ExternalMcpCredentialService,
  input: {
    credentialId?: string
    latencyMs: number
    mcpMethod: string
    operation?: ExternalMcpOperation
    outcome: "allow" | "deny"
    policyVersion?: number
    principalId?: string
    reason: string
    resourceScope?: string
    safeStart?: string
    toolName?: string
  },
) {
  try {
    await service.audit(input)
  } catch {
    // Audit write failure must not turn a denial into access.
  }
}

function normalizeCreateInput(input: ExternalMcpKeyCreateInput) {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) {
    throw new Error("API key name must be between 1 and 80 characters.")
  }
  const resourceScope = normalizeResourceScope(input.resourceScope)
  const profile = input.profile ?? "observer"
  const operation = input.operation ?? externalToolPolicy[profile].operation
  if (operation === "write" && profile !== "collaborator") {
    throw new Error("Write access requires the collaborator profile.")
  }
  const expiresInDays = input.expiresInDays ?? DEFAULT_EXPIRY_DAYS
  if (
    !Number.isInteger(expiresInDays) ||
    expiresInDays < 1 ||
    expiresInDays > MAX_EXPIRY_DAYS
  ) {
    throw new Error("API key expiry must be between 1 and 365 days.")
  }
  const profileTools = new Set<string>(externalToolPolicy[profile].tools)
  const requestedTools = input.toolAllowlist ?? [...profileTools]
  const toolAllowlist = requestedTools.filter((tool) => profileTools.has(tool))
  if (toolAllowlist.length !== requestedTools.length || toolAllowlist.length === 0) {
    throw new Error("External MCP tool allowlist contains an ineligible tool.")
  }
  if (operation === "read" && toolAllowlist.some((tool) => writeTools.has(tool))) {
    throw new Error("Read-only keys cannot include write tools.")
  }
  return { expiresInDays, name, operation, profile, resourceScope, toolAllowlist }
}

function normalizeResourceScope(value: string): string {
  const separator = value.indexOf(":")
  const tier = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (
    separator < 1 ||
    id.length === 0 ||
    !["project", "session", "workspace"].includes(tier)
  ) {
    throw new Error("External MCP resource scope must be canonical.")
  }
  return value
}

function extractBearer(request: Request): string {
  const header = request.headers.get("authorization")
  if (!header) throw new ExternalMcpAuthError()
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) throw new ExternalMcpAuthError()
  return match[1]
}

function hasCredentialInUnsafePlace(request: Request): boolean {
  const url = new URL(request.url)
  return [...url.searchParams.keys()].some((key) =>
    ["api_key", "apikey", "access_token", "token", "key"].includes(key.toLowerCase()),
  )
}

function validateOrigin(
  request: Request,
  configuredTrustedOrigins?: readonly string[],
) {
  const origin = request.headers.get("origin")
  if (!origin) return
  const trusted = configuredTrustedOrigins ?? []
  if (trusted.length === 0) {
    const ownOrigin = new URL(request.url).origin
    if (origin === ownOrigin) return
  }
  if (!trusted.includes(origin)) throw new ExternalMcpForbiddenError("Origin is not allowed.")
}

interface JsonRpcRequest {
  hasCredentialLikeData: boolean
  method?: string
  requestedResourceScope?: string
  toolName?: string
}

function readJsonRpc(body: Uint8Array): JsonRpcRequest | undefined {
  try {
    const payload = JSON.parse(new TextDecoder().decode(body))
    if (!isRecord(payload)) return undefined
    const params = isRecord(payload.params) ? payload.params : undefined
    const requestedResourceScope = findResourceScope(params)
    return {
      hasCredentialLikeData: hasCredentialLikeData(payload),
      method: typeof payload.method === "string" ? payload.method : undefined,
      requestedResourceScope,
      toolName:
        typeof params?.name === "string"
          ? params.name
          : undefined,
    }
  } catch {
    return undefined
  }
}

function rejectCookies(request: Request) {
  if (request.headers.has("cookie")) {
    throw new ExternalMcpAuthError()
  }
}

function enforceInvalidAuthBudget(request: Request) {
  const key = invalidAuthBucketKey(request)
  const bucket = invalidAuthBuckets.get(key)
  if (
    bucket &&
    Date.now() - bucket.windowStart < 60_000 &&
    bucket.count >= MAX_INVALID_AUTH_ATTEMPTS_PER_MINUTE
  ) {
    throw new ExternalMcpRateLimitError(60)
  }
}

function recordInvalidAuthFailure(request: Request) {
  const key = invalidAuthBucketKey(request)
  const now = Date.now()
  const bucket = invalidAuthBuckets.get(key)
  if (!bucket || now - bucket.windowStart >= 60_000) {
    invalidAuthBuckets.set(key, { count: 1, windowStart: now })
    return
  }
  bucket.count += 1
}

function invalidAuthBucketKey(request: Request): string {
  const deployment = new URL(request.url).origin
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  return `${deployment}:${ip}`
}

function hasCredentialLikeData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCredentialLikeData)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase()
    if (
      [
        "authorization",
        "cookie",
        "api_key",
        "apikey",
        "access_token",
        "bearer",
        "credential",
        "credentials",
        "key",
        "password",
        "secret",
        "token",
      ].includes(normalized)
    ) {
      return true
    }
    if (
      typeof child === "string" &&
      (/^Bearer\s+\S+/i.test(child) || child.includes("sigil_live_"))
    ) {
      return true
    }
    return hasCredentialLikeData(child)
  })
}

function findResourceScope(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findResourceScope(item)
      if (found) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  for (const [key, child] of Object.entries(value)) {
    if (
      ["resourceScope", "resource_scope", "scope"].includes(key) &&
      typeof child === "string"
    ) {
      return child
    }
    const found = findResourceScope(child)
    if (found) return found
  }
  return undefined
}

async function readRequestBody(request: Request, maxBytes: number) {
  const buffer = new Uint8Array(await request.arrayBuffer())
  if (buffer.byteLength > maxBytes) {
    return Promise.reject(new Response("Request body too large", { status: 413 }))
  }
  return buffer
}

function assertToolAllowed(grant: GrantRow, toolName: string) {
  if (!isToolAllowed(grant, toolName)) {
    throw new ExternalMcpForbiddenError("Tool is not allowed for this credential.")
  }
}

function isToolAllowed(grant: GrantRow, toolName: string) {
  if (!grant.toolAllowlist.includes(toolName)) return false
  if (!externalToolPolicy[grant.profile].tools.includes(toolName as never)) return false
  if (writeTools.has(toolName) && grant.operation !== "write") return false
  return true
}

function operationForTool(toolName: string): ExternalMcpOperation {
  return writeTools.has(toolName) ? "write" : "read"
}

function securityContextKey(verified: VerifiedCredential): string {
  return [
    "sigil-chat",
    verified.grant.principalId,
    verified.key.id,
    verified.grant.resourceScope,
    verified.grant.policyVersion,
  ].join(":")
}

function grantRow(row: Record<string, unknown>): GrantRow {
  return {
    credentialId: String(row.credential_id ?? row.credentialId),
    createdAt: String(row.created_at ?? row.createdAt),
    keySuffix: String(row.key_suffix ?? row.keySuffix),
    operation: row.operation === "write" ? "write" : "read",
    policyVersion: Number(row.policy_version ?? row.policyVersion),
    principalId: String(row.principal_id ?? row.principalId),
    profile: row.profile === "collaborator" ? "collaborator" : "observer",
    resourceScope: String(row.resource_scope ?? row.resourceScope),
    revokedAt:
      row.revoked_at || row.revokedAt
        ? String(row.revoked_at ?? row.revokedAt)
        : undefined,
    toolAllowlist: parseToolAllowlist(String(row.tool_allowlist ?? row.toolAllowlist)),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  }
}

function parseToolAllowlist(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function summarizeKey(key: ApiKeyRow, grant: GrantRow): ExternalMcpKeySummary {
  return {
    createdAt: toIso(key.createdAt),
    ...(key.expiresAt ? { expiresAt: toIso(key.expiresAt) } : {}),
    id: key.id,
    ...(key.lastRequest ? { lastUsedAt: toIso(key.lastRequest) } : {}),
    name: key.name ?? "Unnamed key",
    operation: grant.operation,
    profile: grant.profile,
    resourceScope: grant.resourceScope,
    ...(grant.revokedAt ? { revokedAt: grant.revokedAt } : {}),
    safeStart: key.start ?? key.prefix ?? "sigil_live_",
    safeSuffix: grant.keySuffix,
    toolAllowlist: grant.toolAllowlist,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readRateLimitRetryAfter(error: unknown): number | undefined {
  if (!isRecord(error) || error.code !== "RATE_LIMITED") return undefined
  const details = error.details
  return isRecord(details) && typeof details.tryAgainIn === "number"
    ? details.tryAgainIn
    : KEY_RATE_LIMIT_WINDOW_MS
}

function statusFor(error: unknown): number {
  if (error instanceof Response) return error.status
  if (error instanceof ExternalMcpRateLimitError) return error.status
  if (error instanceof ExternalMcpForbiddenError) return error.status
  if (error instanceof ExternalMcpAuthError) return error.status
  return 500
}

function reasonFor(error: unknown): string {
  if (error instanceof Response) return `http_${error.status}`
  if (error instanceof ExternalMcpRateLimitError) return "rate_limited"
  if (error instanceof ExternalMcpForbiddenError) return "forbidden"
  if (error instanceof ExternalMcpAuthError) return "invalid_token"
  return "internal_error"
}

function errorResponse(status: number, reason: string, error: unknown): Response {
  if (error instanceof Response) return error
  const headers = new Headers({ "content-type": "application/json" })
  if (status === 401) {
    headers.set("www-authenticate", 'Bearer realm="sigil-external-mcp"')
  }
  if (error instanceof ExternalMcpRateLimitError) {
    headers.set("retry-after", String(error.retryAfterSeconds))
  }
  return new Response(JSON.stringify({ error: reason }), { headers, status })
}

function defaultResourceAuthorizer(input: {
  operation: ExternalMcpOperation
  principalId: string
  resourceScope: string
}): boolean {
  try {
    assertAuthorizedScope(
      input.resourceScope,
      input.principalId,
      () => undefined,
      undefined,
      undefined,
      input.operation === "write" ? "tool" : "read",
    )
    return true
  } catch {
    return false
  }
}
