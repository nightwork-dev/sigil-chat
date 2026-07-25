// Materialize the per-session isolated CODEX_HOME the launch config describes.
//
// buildCoordinatorLaunchConfig is pure; this is the side-effecting half: create
// the directory, write config.toml, and carry over the ChatGPT credentials the
// isolated home still needs (a fresh CODEX_HOME has no login, so the realtime
// backend call would 401). We copy the credential file rather than symlink it
// so a per-session home cleanup can never delete the user's real login.
//
// The isolated home is per-session and disposable; the returned cleanup removes
// it. It holds a copy of the credentials and, when a coordinator is present, in
// config.toml the binding secret — both readable only by the user (0600), in a
// private per-session 0700 temp dir. A crash before dispose would leak that
// dir, so `sweepStaleCoordinatorHomes` clears older ones on host startup.

import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildCoordinatorLaunchConfig,
  type CoordinatorLaunchConfig,
  type CoordinatorServerInput,
} from "./launch-config"

/** Files a ChatGPT-subscription login may live in, newest name first. */
const CREDENTIAL_FILENAMES = [".credentials.json", "auth.json"] as const
/** mkdtemp prefix, shared with the stale-home sweep. */
const HOME_PREFIX = "sigil-coordinator-home-"

export interface MaterializedCoordinatorHome {
  readonly config: CoordinatorLaunchConfig
  /** Remove the isolated home. Idempotent; never throws. */
  dispose(): Promise<void>
}

export interface MaterializeInput {
  /** The delegate surface, or undefined for a hardened-only home (exec off,
   *  no coordinator tool — Annika Finding 1). */
  readonly coordinator?: CoordinatorServerInput
  /** Where the real ChatGPT login lives. Defaults to $CODEX_HOME or ~/.codex. */
  readonly sourceCodexHome?: string
  readonly startupTimeoutSec?: number
}

export function resolveSourceCodexHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.CODEX_HOME?.trim()
  return configured ? configured : join(homedir(), ".codex")
}

export async function materializeCoordinatorHome(
  input: MaterializeInput,
): Promise<MaterializedCoordinatorHome> {
  const codexHome = await mkdtemp(join(tmpdir(), HOME_PREFIX))
  const config = buildCoordinatorLaunchConfig({
    codexHome,
    ...(input.coordinator ? { coordinator: input.coordinator } : {}),
    ...(input.startupTimeoutSec !== undefined
      ? { startupTimeoutSec: input.startupTimeoutSec }
      : {}),
  })

  await writeFile(join(codexHome, "config.toml"), config.configToml, {
    mode: 0o600,
  })
  await carryCredentials(input.sourceCodexHome ?? resolveSourceCodexHome(), codexHome)

  return {
    config,
    async dispose() {
      await rm(codexHome, { recursive: true, force: true }).catch(() => {})
    },
  }
}

/**
 * Best-effort removal of coordinator homes older than `maxAgeMs` — the ones a
 * crashed process could not dispose. Never throws; a home in active use is
 * younger than the cutoff and left alone. Called once at host construction.
 */
export async function sweepStaleCoordinatorHomes(
  maxAgeMs = 60 * 60 * 1_000,
  now: () => number = Date.now,
): Promise<void> {
  const root = tmpdir()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  const cutoff = now() - maxAgeMs
  await Promise.all(
    entries
      .filter((name) => name.startsWith(HOME_PREFIX))
      .map(async (name) => {
        const path = join(root, name)
        try {
          const info = await stat(path)
          if (info.mtimeMs < cutoff) {
            await rm(path, { recursive: true, force: true })
          }
        } catch {
          // Raced with another sweep or already gone — nothing owed.
        }
      }),
  )
}

async function carryCredentials(
  sourceCodexHome: string,
  codexHome: string,
): Promise<void> {
  for (const filename of CREDENTIAL_FILENAMES) {
    const source = join(sourceCodexHome, filename)
    if (!existsSync(source)) continue
    await mkdir(codexHome, { recursive: true })
    const dest = join(codexHome, filename)
    await copyFile(source, dest)
    await chmod(dest, 0o600)
  }
}
