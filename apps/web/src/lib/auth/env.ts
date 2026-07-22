import { randomBytes } from "node:crypto"
import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"

import type { AuthEmailConfig } from "./auth-email.server"

export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

export interface OktaProviderCredentials extends SocialProviderCredentials {
  issuer: string
}

export interface SocialProviderEnvironment {
  discord?: SocialProviderCredentials
  github?: SocialProviderCredentials
  google?: SocialProviderCredentials
  okta?: OktaProviderCredentials
}

export interface AuthEnvironment {
  baseUrl: string
  databaseAuthToken?: string
  databaseUrl: string
  installationId: string
  isProduction: boolean
  authEmail?: AuthEmailConfig
  registrationOpen: boolean
  secret: string
  socialProviders: SocialProviderEnvironment
  trustedOrigins: string[]
}

const LOCAL_DATABASE_URL = "file:.data/sigil-chat.db"
const LOCAL_SECRET_PATH = ".data/auth-secret"

function readProviderCredentials(
  source: NodeJS.ProcessEnv,
  provider: "DISCORD" | "GITHUB" | "GOOGLE",
): SocialProviderCredentials | undefined {
  const clientId = source[`SIGIL_AUTH_${provider}_CLIENT_ID`]?.trim()
  const clientSecret = source[`SIGIL_AUTH_${provider}_CLIENT_SECRET`]?.trim()

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(
      `SIGIL_AUTH_${provider}_CLIENT_ID and SIGIL_AUTH_${provider}_CLIENT_SECRET must be configured together`,
    )
  }

  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

function readOktaCredentials(
  source: NodeJS.ProcessEnv,
): OktaProviderCredentials | undefined {
  const clientId = source.SIGIL_AUTH_OKTA_CLIENT_ID?.trim()
  const clientSecret = source.SIGIL_AUTH_OKTA_CLIENT_SECRET?.trim()
  const issuer = source.SIGIL_AUTH_OKTA_ISSUER?.trim()
  const configuredValues = [clientId, clientSecret, issuer].filter(Boolean)

  if (configuredValues.length > 0 && configuredValues.length < 3) {
    throw new Error(
      "SIGIL_AUTH_OKTA_CLIENT_ID, SIGIL_AUTH_OKTA_CLIENT_SECRET, and SIGIL_AUTH_OKTA_ISSUER must be configured together",
    )
  }

  if (!clientId || !clientSecret || !issuer) return undefined

  const parsedIssuer = new URL(issuer)
  if (parsedIssuer.search || parsedIssuer.hash) {
    throw new Error("SIGIL_AUTH_OKTA_ISSUER cannot contain a query or hash")
  }

  return {
    clientId,
    clientSecret,
    issuer: parsedIssuer.href.replace(/\/$/, ""),
  }
}

function getOrCreateLocalSecret(path = LOCAL_SECRET_PATH): string {
  const absolutePath = resolve(path)
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

function parseTrustedOrigins(
  value: string | undefined,
  baseUrl: string,
  isProduction: boolean,
) {
  const configured = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  const origins = configured?.length ? configured : [baseUrl]
  if (!isProduction) {
    origins.push("http://sigil-chat.localhost:1355", "http://localhost:3000")
  }

  return [...new Set(origins)].map((origin) => {
    const parsed = new URL(origin)
    if (
      parsed.origin !== origin ||
      parsed.hostname.includes("*") ||
      !["http:", "https:"].includes(parsed.protocol)
    ) {
      throw new Error(
        `SIGIL_AUTH_TRUSTED_ORIGINS contains an invalid exact origin: ${origin}`,
      )
    }
    return origin
  })
}

export function readAuthEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  options: { localSecretPath?: string } = {},
): AuthEnvironment {
  const isProduction = source.NODE_ENV === "production"
  const baseUrl =
    source.BETTER_AUTH_URL ??
    (isProduction ? undefined : "http://sigil-chat.localhost:1355")
  const databaseUrl =
    source.SIGIL_DATABASE_URL ?? (isProduction ? undefined : LOCAL_DATABASE_URL)
  const secret =
    readOptionalSecretFromFile(source, "BETTER_AUTH_SECRET") ??
    (isProduction ? undefined : getOrCreateLocalSecret(options.localSecretPath))
  const installationId =
    source.SIGIL_INSTALLATION_ID ??
    (isProduction ? undefined : "sigil-chat-local")
  const authEmailApiKey = source.RESEND_API_KEY?.trim()
  const authEmailFrom = source.SIGIL_AUTH_EMAIL_FROM?.trim()

  if (Boolean(authEmailApiKey) !== Boolean(authEmailFrom)) {
    throw new Error(
      "RESEND_API_KEY and SIGIL_AUTH_EMAIL_FROM must be configured together",
    )
  }

  if (!baseUrl) {
    throw new Error("BETTER_AUTH_URL is required in production")
  }
  if (!databaseUrl) {
    throw new Error("SIGIL_DATABASE_URL is required in production")
  }
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required in production")
  }
  if (!installationId) {
    throw new Error("SIGIL_INSTALLATION_ID is required in production")
  }
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters")
  }

  return {
    baseUrl,
    databaseAuthToken: source.SIGIL_DATABASE_AUTH_TOKEN,
    databaseUrl,
    installationId,
    isProduction,
    ...(authEmailApiKey && authEmailFrom
      ? { authEmail: { apiKey: authEmailApiKey, from: authEmailFrom } }
      : {}),
    registrationOpen: source.SIGIL_AUTH_REGISTRATION === "open",
    secret,
    socialProviders: {
      discord: readProviderCredentials(source, "DISCORD"),
      github: readProviderCredentials(source, "GITHUB"),
      google: readProviderCredentials(source, "GOOGLE"),
      okta: readOktaCredentials(source),
    },
    trustedOrigins: parseTrustedOrigins(
      source.SIGIL_AUTH_TRUSTED_ORIGINS,
      baseUrl,
      isProduction,
    ),
  }
}
