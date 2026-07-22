import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { readAuthEnvironment } from "./env"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("readAuthEnvironment", () => {
  it("fails closed when production database configuration is missing", () => {
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_INSTALLATION_ID: "production-installation",
      }),
    ).toThrow("SIGIL_DATABASE_URL is required in production")
  })

  it("fails closed when the production auth secret is missing", () => {
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_DATABASE_URL: "file:production.db",
        SIGIL_INSTALLATION_ID: "production-installation",
      }),
    ).toThrow("BETTER_AUTH_SECRET is required in production")
  })

  it("requires a production base URL and exact trusted origins", () => {
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET:
          "a-production-secret-with-at-least-thirty-two-characters",
        NODE_ENV: "production",
        SIGIL_DATABASE_URL: "file:production.db",
        SIGIL_INSTALLATION_ID: "production-installation",
      }),
    ).toThrow("BETTER_AUTH_URL is required in production")

    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET:
          "a-production-secret-with-at-least-thirty-two-characters",
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_AUTH_TRUSTED_ORIGINS: "https://*.example.test",
        SIGIL_DATABASE_URL: "file:production.db",
        SIGIL_INSTALLATION_ID: "production-installation",
      }),
    ).toThrow("invalid exact origin")
  })

  it("requires a stable installation id in production", () => {
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET:
          "a-production-secret-with-at-least-thirty-two-characters",
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_DATABASE_URL: "file:production.db",
      }),
    ).toThrow("SIGIL_INSTALLATION_ID is required in production")
  })

  it("creates and reuses an owner-only local secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "sigil-auth-env-"))
    temporaryDirectories.push(directory)
    const secretPath = join(directory, "auth-secret")

    const first = readAuthEnvironment({}, { localSecretPath: secretPath })
    const second = readAuthEnvironment({}, { localSecretPath: secretPath })

    expect(first.secret).toBe(second.secret)
    expect(first.installationId).toBe("sigil-chat-local")
    expect(readFileSync(secretPath, "utf8").trim()).toBe(first.secret)
    expect(statSync(secretPath).mode & 0o777).toBe(0o600)
  })

  it("requires complete magic-link email configuration", () => {
    expect(() => readAuthEnvironment({ RESEND_API_KEY: "resend-key" })).toThrow(
      "must be configured together",
    )

    const environment = readAuthEnvironment({
      RESEND_API_KEY: "resend-key",
      SIGIL_AUTH_EMAIL_FROM: "Sigil <signin@example.test>",
    })
    expect(environment.magicLinkEmail).toEqual({
      apiKey: "resend-key",
      from: "Sigil <signin@example.test>",
    })
  })
})
