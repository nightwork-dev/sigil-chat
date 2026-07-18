import type { Client } from "@libsql/client"
import { betterAuth } from "better-auth"
import type { BetterAuthOptions } from "better-auth"
import { jwt, username } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import type { Kysely } from "kysely"

import { createAuthDatabase } from "./db"
import { readAuthEnvironment, type AuthEnvironment } from "./env"
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
      minPasswordLength: 12,
    },
    rateLimit: {
      enabled: true,
      customRules: {
        "/sign-in/username": { max: 5, window: 60 },
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
        minUsernameLength: 3,
        usernameNormalization: normalizeUsername,
        usernameValidator: isAllowedUsername,
        validationOrder: { username: "post-normalization" },
      }),
      jwt({
        jwt: {
          audience: "sigil-chat-agent",
          expirationTime: "5m",
          issuer: environment.baseUrl,
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

let defaultAuth: Promise<SigilAuthInstance> | undefined

export async function getAuth(): Promise<SigilAuthInstance> {
  if (!defaultAuth) {
    defaultAuth = (async () => {
      const environment = readAuthEnvironment()
      const database = createAuthDatabase(environment)
      await assertAuthMigrationsApplied(database.client)
      return createSigilAuth({ ...database, environment })
    })()
  }

  return defaultAuth
}
