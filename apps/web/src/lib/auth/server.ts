import type { Client } from "@libsql/client"
import { apiKey } from "@better-auth/api-key"
import { betterAuth } from "better-auth"
import type { BetterAuthOptions } from "better-auth"
import { jwt, magicLink, username } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import type { Kysely } from "kysely"

import { createAuthDatabase, type AuthDatabase } from "./db"
import { readAuthEnvironment, type AuthEnvironment } from "./env"
import { sendMagicLinkEmail } from "./magic-link-email.server"
import { assertAuthMigrationsApplied } from "./migrations"
import {
  createRegistrationPolicy,
  isAllowedUsername,
  normalizeUsername,
  type RegistrationPolicy,
  type SigilRole,
} from "./policy"
import { authUserAdditionalFields } from "./schema"

export interface SigilAuthUser {
  displayUsername?: string | null
  email: string
  id: string
  name: string
  role: SigilRole
  username?: string | null
}

export interface SigilAuthSession {
  session: {
    expiresAt: Date
    id: string
  }
  user: SigilAuthUser
}

export interface SigilAuthInstance {
  api: {
    getSession(input: { headers: Headers }): Promise<SigilAuthSession | null>
    getToken(input: { headers: Headers }): Promise<{ token: string }>
  }
  handler(request: Request): Promise<Response>
}

export interface CreateSigilAuthOptions {
  client: Client
  environment: AuthEnvironment
  kysely: Kysely<Record<string, unknown>>
  registrationPolicy?: RegistrationPolicy
}

export function createSigilAuthOptions(
  options: CreateSigilAuthOptions,
): BetterAuthOptions {
  const { client, environment, kysely } = options
  const registrationPolicy =
    options.registrationPolicy ??
    createRegistrationPolicy(client, {
      registrationOpen: environment.registrationOpen,
    })

  return {
    advanced: {
      useSecureCookies: environment.isProduction,
    },
    baseURL: environment.baseUrl,
    database: { db: kysely, type: "sqlite" },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              role: await registrationPolicy.roleForNextUser(),
            },
          }),
        },
      },
    },
    disabledPaths: ["/is-username-available"],
    emailAndPassword: {
      enabled: true,
      maxPasswordLength: 128,
      // Better Auth's own default floor; no symbol/composition rules.
      minPasswordLength: 8,
    },
    rateLimit: {
      enabled: true,
      customRules: {
        // Sign-in is email + password; brute-force cap on that path.
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-up/email": { max: 3, window: 60 },
      },
      max: 100,
      window: 60,
    },
    secret: environment.secret,
    trustedOrigins: environment.trustedOrigins,
    user: {
      additionalFields: authUserAdditionalFields,
    },
    plugins: [
      username({
        maxUsernameLength: 32,
        // Length is not a security boundary on a self-hosted install; min 1.
        minUsernameLength: 1,
        usernameNormalization: normalizeUsername,
        usernameValidator: isAllowedUsername,
        validationOrder: { username: "post-normalization" },
      }),
      jwt({
        jwt: {
          audience: "sigil-chat-agent",
          definePayload: ({ user }) => ({
            installationId: environment.installationId,
            role: user.role,
          }),
          expirationTime: "5m",
          issuer: environment.baseUrl,
        },
      }),
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        sendMagicLink: ({ email, url }) =>
          sendMagicLinkEmail(
            environment.magicLinkEmail,
            { email, url },
            { siteName: process.env.SIGIL_APP_NAME?.trim() || "Sigil Chat" },
          ),
        storeToken: "hashed",
      }),
      apiKey({
        defaultPrefix: "sigil_live_",
        defaultKeyLength: 48,
        enableMetadata: true,
        enableSessionForAPIKeys: false,
        keyExpiration: {
          defaultExpiresIn: 90 * 24 * 60 * 60,
          maxExpiresIn: 365,
          minExpiresIn: 1,
        },
        maximumNameLength: 80,
        rateLimit: {
          enabled: true,
          maxRequests: 120,
          timeWindow: 60 * 1000,
        },
        requireName: true,
        startingCharactersConfig: {
          charactersLength: 16,
          shouldStore: true,
        },
      }),
      tanstackStartCookies(),
    ],
  }
}

export function createSigilAuth(
  options: CreateSigilAuthOptions,
): SigilAuthInstance {
  return betterAuth(
    createSigilAuthOptions(options),
  ) as unknown as SigilAuthInstance
}

let defaultDatabase:
  Promise<{ database: AuthDatabase; environment: AuthEnvironment }> | undefined

// Shared, cached environment + connection so getAuth() and any other
// installation-level query (e.g. the first-user check backing /setup) reuse
// exactly one libsql client rather than opening a second connection.
async function getAuthDatabase() {
  if (!defaultDatabase) {
    defaultDatabase = (async () => {
      const environment = readAuthEnvironment()
      const database = createAuthDatabase(environment)
      await assertAuthMigrationsApplied(database.client)
      return { database, environment }
    })()
  }

  return defaultDatabase
}

let defaultAuth: Promise<SigilAuthInstance> | undefined

export async function getAuth(): Promise<SigilAuthInstance> {
  if (!defaultAuth) {
    defaultAuth = (async () => {
      const { database, environment } = await getAuthDatabase()
      return createSigilAuth({ ...database, environment })
    })()
  }

  return defaultAuth
}

// First-run gate for /setup: true once any user row exists. Reuses the
// cached auth connection rather than opening its own; this is a read-only
// existence check, not a substitute for the registration-policy transaction
// in policy.ts that actually decides the next user's role.
export async function hasAnyUser(): Promise<boolean> {
  const { database } = await getAuthDatabase()
  const result = await database.client.execute("SELECT 1 FROM user LIMIT 1")
  return result.rows.length > 0
}

// Shared libsql client for app-owned tables that live in the same auth
// database (e.g. user_settings, S10.4) but are NOT Better Auth's own schema.
// Reuses the one cached connection rather than opening a second client.
export async function getAuthDbClient(): Promise<Client> {
  const { database } = await getAuthDatabase()
  return database.client
}
