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
      }),
    ).toThrow("SIGIL_DATABASE_URL is required in production")
  })

  it("fails closed when the production auth secret is missing", () => {
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_URL: "https://chat.example.test",
        NODE_ENV: "production",
        SIGIL_DATABASE_URL: "file:production.db",
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
      }),
    ).toThrow("invalid exact origin")
  })

  it("creates and reuses an owner-only local secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "sigil-auth-env-"))
    temporaryDirectories.push(directory)
    const secretPath = join(directory, "auth-secret")

    const first = readAuthEnvironment({}, { localSecretPath: secretPath })
    const second = readAuthEnvironment({}, { localSecretPath: secretPath })

    expect(first.secret).toBe(second.secret)
    expect(readFileSync(secretPath, "utf8").trim()).toBe(first.secret)
    expect(statSync(secretPath).mode & 0o777).toBe(0o600)
  })
})
