import { createHmac, randomBytes, randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import type { Client, Transaction } from "@libsql/client"
import { hashPassword } from "better-auth/crypto"

import { getAuthDbClient } from "./server"
import { displayNameFromEmail, usernameFromEmail } from "./username-from-email"

const DIGEST_VERSION = "v1"
const INVITE_BYTES = 32
const INVITE_LIST_LIMIT = 25
const LOCAL_PEPPER_PATH = ".data/invite-token-pepper"
const MAX_INVITE_HOURS = 24

export type InviteStatus = "available" | "expired" | "revoked" | "used"

export interface AuthInviteSummary {
  createdAt: string
  expiresAt: string
  id: string
  status: InviteStatus
  usedAt?: string
}

export interface CreatedAuthInvite {
  invite: AuthInviteSummary
  token: string
}

export interface RedeemAuthInviteInput {
  email: string
  password: string
  token: string
}

interface AuthInviteServiceOptions {
  client: Client
  createId?: () => string
  createToken?: () => string
  now?: () => Date
  pepper: string
}

interface InviteRow {
  channelIds: string[]
  consumedAt?: string
  createdAt: string
  expiresAt: string
  id: string
  revokedAt?: string
}

export class AuthInviteUnavailableError extends Error {
  constructor() {
    super("This invitation is invalid, expired, revoked, or already used.")
    this.name = "AuthInviteUnavailableError"
  }
}

export class AuthInviteService {
  private readonly client: Client
  private readonly createId: () => string
  private readonly createToken: () => string
  private readonly now: () => Date
  private readonly pepper: string

  constructor(options: AuthInviteServiceOptions) {
    if (options.pepper.length < 32) {
      throw new Error("Invitation token pepper must be at least 32 characters.")
    }
    this.client = options.client
    this.createId = options.createId ?? randomUUID
    this.createToken =
      options.createToken ??
      (() => randomBytes(INVITE_BYTES).toString("base64url"))
    this.now = options.now ?? (() => new Date())
    this.pepper = options.pepper
  }

  async create(
    ownerId: string,
    expiresInHours: number,
  ): Promise<CreatedAuthInvite> {
    if (
      !Number.isInteger(expiresInHours) ||
      expiresInHours < 1 ||
      expiresInHours > MAX_INVITE_HOURS
    ) {
      throw new Error("Invitation expiry must be between 1 and 24 hours.")
    }
    const token = this.createToken()
    const createdAt = this.now()
    const expiresAt = new Date(
      createdAt.getTime() + expiresInHours * 60 * 60 * 1000,
    )
    const id = this.createId()

    await this.client.execute({
      sql: `
        INSERT INTO auth_invite (
          id, token_digest, created_by_user_id, role, channel_ids,
          created_at, expires_at
        ) VALUES (?, ?, ?, 'member', '[]', ?, ?)
      `,
      args: [
        id,
        this.digest(token),
        ownerId,
        createdAt.toISOString(),
        expiresAt.toISOString(),
      ],
    })

    return {
      invite: {
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        id,
        status: "available",
      },
      token,
    }
  }

  async list(): Promise<AuthInviteSummary[]> {
    const result = await this.client.execute({
      sql: `
        SELECT id, channel_ids, created_at, expires_at, consumed_at, revoked_at
        FROM auth_invite
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args: [INVITE_LIST_LIMIT],
    })
    const now = this.now()
    return result.rows.map((row) => {
      const invite = inviteRow(row)
      return {
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        id: invite.id,
        status: statusOf(invite, now),
        ...(invite.consumedAt ? { usedAt: invite.consumedAt } : {}),
      }
    })
  }

  async redeem(input: RedeemAuthInviteInput): Promise<{ email: string }> {
    const email = normalizeEmail(input.email)
    if (input.password.length < 8 || input.password.length > 128) {
      throw new Error("Password must be between 8 and 128 characters.")
    }
    if (!input.token.trim()) throw new AuthInviteUnavailableError()

    // Better Auth's own password primitive is used, but account admission and
    // invite consumption share one libSQL write transaction so a race or any
    // failed insert creates neither an account nor a consumed invitation.
    const passwordHash = await hashPassword(input.password)
    const transaction = await this.client.transaction("write")
    try {
      const invite = await this.requireAvailableInvite(transaction, input.token)
      if (invite.channelIds.length > 0) {
        // Channel membership is not auth-DB-owned yet. Refuse rather than
        // pretending a cross-store write can satisfy the atomicity contract.
        throw new Error("Channel-scoped invitations are not available yet.")
      }
      const existing = await transaction.execute({
        sql: "SELECT 1 FROM user WHERE lower(email) = ? LIMIT 1",
        args: [email],
      })
      if (existing.rows.length > 0) {
        throw new Error("An account already exists for this email address.")
      }

      const userId = this.createId()
      const accountId = this.createId()
      const timestamp = this.now().toISOString()
      const username = await uniqueUsername(
        transaction,
        usernameFromEmail(email),
        userId,
      )

      await transaction.execute({
        sql: `
          INSERT INTO user (
            id, name, email, emailVerified, createdAt, updatedAt,
            username, displayUsername, role
          ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'member')
        `,
        args: [
          userId,
          displayNameFromEmail(email),
          email,
          timestamp,
          timestamp,
          username,
          username,
        ],
      })
      await transaction.execute({
        sql: `
          INSERT INTO account (
            id, accountId, providerId, userId, password, createdAt, updatedAt
          ) VALUES (?, ?, 'credential', ?, ?, ?, ?)
        `,
        args: [accountId, userId, userId, passwordHash, timestamp, timestamp],
      })
      const consumed = await transaction.execute({
        sql: `
          UPDATE auth_invite
          SET consumed_at = ?, consumed_by_user_id = ?
          WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
            AND expires_at > ?
        `,
        args: [timestamp, userId, invite.id, timestamp],
      })
      if (consumed.rowsAffected !== 1) throw new AuthInviteUnavailableError()

      await transaction.commit()
      return { email }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  async revoke(id: string): Promise<void> {
    const result = await this.client.execute({
      sql: `
        UPDATE auth_invite
        SET revoked_at = ?
        WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
      `,
      args: [this.now().toISOString(), id],
    })
    if (result.rowsAffected !== 1) throw new AuthInviteUnavailableError()
  }

  private digest(token: string): string {
    const digest = createHmac("sha256", this.pepper)
      .update(token)
      .digest("base64url")
    return `${DIGEST_VERSION}:${digest}`
  }

  private async requireAvailableInvite(
    transaction: Transaction,
    token: string,
  ): Promise<InviteRow> {
    const result = await transaction.execute({
      sql: `
        SELECT id, channel_ids, created_at, expires_at, consumed_at, revoked_at
        FROM auth_invite
        WHERE token_digest = ?
        LIMIT 1
      `,
      args: [this.digest(token)],
    })
    const row = result.rows[0] ? inviteRow(result.rows[0]) : undefined
    if (!row || statusOf(row, this.now()) !== "available") {
      throw new AuthInviteUnavailableError()
    }
    return row
  }
}

export async function getAuthInviteService(): Promise<AuthInviteService> {
  return new AuthInviteService({
    client: await getAuthDbClient(),
    pepper: readInviteTokenPepper(),
  })
}

function readInviteTokenPepper(
  source: NodeJS.ProcessEnv = process.env,
  localPath = LOCAL_PEPPER_PATH,
): string {
  const configuredPath = source.SIGIL_INVITE_TOKEN_PEPPER_FILE?.trim()
  if (configuredPath) {
    const pepper = readFileSync(configuredPath, "utf8").trim()
    if (pepper.length < 32) {
      throw new Error("SIGIL_INVITE_TOKEN_PEPPER_FILE is too short.")
    }
    return pepper
  }
  if (source.NODE_ENV === "production") {
    throw new Error("SIGIL_INVITE_TOKEN_PEPPER_FILE is required in production.")
  }

  const absolutePath = resolve(localPath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, randomBytes(32).toString("base64url"), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })
  }
  chmodSync(absolutePath, 0o600)
  return readFileSync(absolutePath, "utf8").trim()
}

async function uniqueUsername(
  transaction: Transaction,
  preferred: string,
  userId: string,
): Promise<string> {
  const existing = await transaction.execute({
    sql: "SELECT 1 FROM user WHERE username = ? LIMIT 1",
    args: [preferred],
  })
  if (existing.rows.length === 0) return preferred
  return `${preferred.slice(0, 25)}-${userId.replaceAll("-", "").slice(0, 6)}`
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid email address.")
  }
  return normalized
}

function statusOf(row: InviteRow, now: Date): InviteStatus {
  if (row.revokedAt) return "revoked"
  if (row.consumedAt) return "used"
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return "expired"
  return "available"
}

function inviteRow(row: Record<string, unknown>): InviteRow {
  return {
    id: requiredString(row.id, "id"),
    channelIds: parseChannelIds(row.channel_ids),
    createdAt: requiredString(row.created_at, "created_at"),
    expiresAt: requiredString(row.expires_at, "expires_at"),
    ...(stringValue(row.consumed_at)
      ? { consumedAt: stringValue(row.consumed_at) }
      : {}),
    ...(stringValue(row.revoked_at)
      ? { revokedAt: stringValue(row.revoked_at) }
      : {}),
  }
}

function parseChannelIds(value: unknown): string[] {
  if (typeof value !== "string") throw new Error("Invalid invite channels.")
  const parsed = JSON.parse(value) as unknown
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error("Invalid invite channels.")
  }
  return parsed
}

function requiredString(value: unknown, field: string): string {
  const result = stringValue(value)
  if (!result) throw new Error(`Auth invite row has invalid ${field}.`)
  return result
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}
