import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, "..")
const projectDirectory = resolve(appDirectory, "../..")
const provider = resolveProvider()

if (provider === undefined) {
  console.log(
    "Hosted provider Eve smoke skipped: set SIGIL_HOSTED_MODEL_PROVIDER plus its SIGIL_MODEL_*_API_KEY to run the live full-path proof.",
  )
  process.exit(0)
}

const fixtureDirectory = mkdtempSync(
  join(tmpdir(), "sigil-eve-hosted-provider-smoke-"),
)
const output = []
let child

try {
  copyAppFixture(fixtureDirectory, provider)
  const port = await reservePort()
  child = spawn(
    join(appDirectory, "node_modules", ".bin", "eve"),
    ["dev", "--no-ui", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: fixtureDirectory,
      env: {
        ...process.env,
        SIGIL_AGENT_BINDING_SECRET: "sigil-hosted-provider-smoke-secret",
        SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  child.stdout.on("data", (chunk) => capture(chunk))
  child.stderr.on("data", (chunk) => capture(chunk))

  await waitForInfoRoute(child, port)
  const proof = issueAgentSessionBinding(
    {
      additionalContextScopeIds: [],
      applicationThreadId: "thread-hosted-provider-smoke",
      expiresAt: Math.floor(Date.now() / 1_000) + 60,
      homeScopeId: "workspace-hosted-smoke",
      initialPerspective: {
        focusScopeId: "workspace-hosted-smoke",
        viaScopeIds: ["project-hosted-smoke"],
      },
      personaId: "sigil-chat-eve",
      subject: "local-dev",
    },
    "sigil-hosted-provider-smoke-secret",
  )
  const response = await fetch(`http://127.0.0.1:${port}/eve/v1/session`, {
    body: JSON.stringify({
      message:
        "Reply with exactly: hosted provider smoke complete. Do not call tools.",
    }),
    headers: {
      [AGENT_SESSION_BINDING_HEADER]: proof,
      "content-type": "application/json",
    },
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(
      `Hosted provider Eve session POST returned HTTP ${response.status}: ${await response.text()}`,
    )
  }
  console.log(
    `Hosted provider Eve smoke submitted through ${provider.provider}/${provider.model}. Check the session stream/logs for provider response completion.`,
  )
} catch (error) {
  if (output.length > 0) console.error(output.join("").slice(-20_000))
  throw error
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await once(child, "exit")
  }
  rmSync(fixtureDirectory, { force: true, recursive: true })
}

function resolveProvider() {
  const configuredProvider = process.env.SIGIL_HOSTED_MODEL_PROVIDER?.trim()
  const candidate =
    configuredProvider ||
    (hasEnv("SIGIL_MODEL_OPENROUTER_API_KEY")
      ? "openrouter"
      : hasEnv("SIGIL_MODEL_ANTHROPIC_API_KEY")
        ? "anthropic"
        : undefined)
  if (candidate !== "openrouter" && candidate !== "anthropic") return undefined
  const envName =
    candidate === "openrouter"
      ? "SIGIL_MODEL_OPENROUTER_API_KEY"
      : "SIGIL_MODEL_ANTHROPIC_API_KEY"
  if (!hasEnv(envName)) return undefined
  const model =
    process.env.SIGIL_HOSTED_MODEL_ID?.trim() ||
    (candidate === "openrouter"
      ? "anthropic/claude-sonnet-4.6"
      : "claude-sonnet-4.6")
  return { apiKeyEnv: envName, model, provider: candidate }
}

function copyAppFixture(targetDirectory, modelProvider) {
  cpSync(join(appDirectory, "agent"), join(targetDirectory, "agent"), {
    filter: (source) => !source.split("/").includes(".agents"),
    recursive: true,
  })
  cpSync(join(appDirectory, "package.json"), join(targetDirectory, "package.json"))
  cpSync(join(appDirectory, "tsconfig.json"), join(targetDirectory, "tsconfig.json"))
  cpSync(join(appDirectory, "scripts"), join(targetDirectory, "scripts"), {
    recursive: true,
  })
  cpSync(join(projectDirectory, "fixtures"), join(targetDirectory, "fixtures"), {
    recursive: true,
  })
  symlinkSync(join(appDirectory, "node_modules"), join(targetDirectory, "node_modules"))

  const fixturePath = join(
    targetDirectory,
    "fixtures",
    "application",
    "sigil-chat.yaml",
  )
  const fixture = readFileSync(fixturePath, "utf8").replace(
    /^agent:\n  model:.*$/m,
    [
      "agent:",
      "  model:",
      `    provider: ${modelProvider.provider}`,
      `    model: ${modelProvider.model}`,
      `    apiKeyEnv: ${modelProvider.apiKeyEnv}`,
    ].join("\n"),
  )
  writeFileSync(fixturePath, fixture)
}

function hasEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0
}

function capture(chunk) {
  output.push(String(chunk))
  if (output.length > 200) output.shift()
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("Could not reserve a loopback port for the hosted smoke")
  }
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  )
  return address.port
}

async function waitForInfoRoute(processHandle, port) {
  const deadline = Date.now() + Number(process.env.COLD_BOOT_TIMEOUT_MS ?? 60_000)
  const url = `http://127.0.0.1:${port}/eve/v1/info`
  let lastProbeFailure = "no response received"

  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `Eve exited before its info route was ready (exit ${processHandle.exitCode})`,
      )
    }
    try {
      const response = await fetch(url)
      if (response.status === 200) return response
      lastProbeFailure = `HTTP ${response.status}`
    } catch (error) {
      lastProbeFailure = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }

  throw new Error(
    `Timed out waiting for Eve's info route (${lastProbeFailure})`,
  )
}
