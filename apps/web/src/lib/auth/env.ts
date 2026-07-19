import { randomBytes } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"

export interface AuthEnvironment {
  baseUrl: string
  databaseAuthToken?: string
  databaseUrl: string
  installationId: string
  isProduction: boolean
  registrationOpen: boolean
  secret: string
  trustedOrigins: string[]
}

const LOCAL_DATABASE_URL = "file:.data/sigil-chat.db"
const LOCAL_SECRET_PATH = ".data/auth-secret"

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
    source.BETTER_AUTH_SECRET ??
    (isProduction ? undefined : getOrCreateLocalSecret(options.localSecretPath))
  const installationId =
    source.SIGIL_INSTALLATION_ID ??
    (isProduction ? undefined : "sigil-chat-local")

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
    registrationOpen: source.SIGIL_AUTH_REGISTRATION === "open",
    secret,
    trustedOrigins: parseTrustedOrigins(
      source.SIGIL_AUTH_TRUSTED_ORIGINS,
      baseUrl,
      isProduction,
    ),
  }
}
