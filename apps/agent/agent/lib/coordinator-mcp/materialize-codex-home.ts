// Materialize the per-session isolated CODEX_HOME the launch config describes.
//
// buildCoordinatorLaunchConfig is pure; this is the side-effecting half: create
// the directory, write config.toml, and carry over the ChatGPT credentials the
// isolated home still needs (a fresh CODEX_HOME has no login, so the realtime
// backend call would 401). We copy the credential file rather than symlink it
// so a per-session home cleanup can never delete the user's real login.
//
// The isolated home is per-session and disposable; the returned cleanup removes
// it. It holds a copy of the credentials and, in config.toml, the binding
// secret — both readable only by the user, in a private per-session temp dir.

import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildCoordinatorLaunchConfig,
  type CoordinatorLaunchConfig,
} from "./launch-config"
import type { CoordinatorBoundContext } from "./context"

/** Files a ChatGPT-subscription login may live in, newest name first. */
const CREDENTIAL_FILENAMES = [".credentials.json", "auth.json"] as const

export interface MaterializedCoordinatorHome {
  readonly config: CoordinatorLaunchConfig
  /** Remove the isolated home. Idempotent; never throws. */
  dispose(): Promise<void>
}

export interface MaterializeInput {
  readonly context: CoordinatorBoundContext
  readonly serverCommand: string
  readonly serverArgs: readonly string[]
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
  const codexHome = await mkdtemp(join(tmpdir(), "sigil-coordinator-home-"))
  const config = buildCoordinatorLaunchConfig({
    codexHome,
    serverCommand: input.serverCommand,
    serverArgs: input.serverArgs,
    context: input.context,
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
