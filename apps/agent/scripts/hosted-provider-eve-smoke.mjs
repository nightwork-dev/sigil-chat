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
    "Hosted provider Eve smoke skipped: set SIGIL_HOSTED_MODEL_PROVIDER plus its SIGIL_MODEL_*_API_KEY to run the live signed-Eve-boundary provider/tool proof.",
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
        "Use the todo tool once to record that hosted provider smoke ran, then reply with exactly: hosted provider smoke complete.",
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
  const sessionId = await readSessionId(response)
  const streamSummary = await assertToolLoopStream({
    expectedFinalText: "hosted provider smoke complete",
    label: `hosted ${provider.provider}`,
    port,
    proof,
    sessionId,
  })
  console.log(
    `Hosted provider Eve smoke passed through ${provider.provider}/${provider.model}: native todo tool requested, tool result completed, and final model completion observed (${streamSummary.events} events).`,
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

async function readSessionId(response) {
  const payload = await response.json()
  const sessionId =
    stringOf(payload, "sessionId") ?? response.headers.get("x-eve-session-id")
  if (!sessionId) {
    throw new Error(
      `Eve session POST did not return a session id: ${JSON.stringify(payload)}`,
    )
  }
  return sessionId
}

async function assertToolLoopStream({
  expectedFinalText,
  label,
  port,
  proof,
  sessionId,
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  const response = await fetch(
    `http://127.0.0.1:${port}/eve/v1/session/${encodeURIComponent(sessionId)}/stream`,
    {
      headers: {
        [AGENT_SESSION_BINDING_HEADER]: proof,
      },
      method: "GET",
      signal: controller.signal,
    },
  )
  try {
    if (!response.ok || !response.body) {
      throw new Error(
        `Eve ${label} stream returned HTTP ${response.status}: ${await response.text()}`,
      )
    }

    const summary = {
      actionResultCompleted: false,
      events: 0,
      finalMessageCompleted: false,
      todoRequested: false,
      turnCompleted: false,
    }
    for await (const event of readNdjsonEvents(response.body)) {
      summary.events += 1
      if (event.type === "step.failed" || event.type === "turn.failed") {
        throw new Error(`Eve ${label} stream failed: ${JSON.stringify(event)}`)
      }
      if (event.type === "action.result") {
        if (event.data?.status !== "completed") {
          throw new Error(
            `Eve ${label} action did not complete: ${JSON.stringify(event)}`,
          )
        }
        summary.actionResultCompleted = true
      }
      if (
        event.type === "actions.requested" &&
        JSON.stringify(event.data?.actions ?? []).includes('"todo"')
      ) {
        summary.todoRequested = true
      }
      if (event.type === "message.completed") {
        const message = event.data?.message
        const finishReason = event.data?.finishReason
        if (finishReason === "error") {
          throw new Error(
            `Eve ${label} message completed with error: ${JSON.stringify(event)}`,
          )
        }
        if (
          finishReason === "stop" &&
          typeof message === "string" &&
          message.toLowerCase().includes(expectedFinalText)
        ) {
          summary.finalMessageCompleted = true
        }
      }
      if (event.type === "turn.completed") {
        summary.turnCompleted = true
        break
      }
    }

    const missing = []
    if (!summary.todoRequested) missing.push("native todo action request")
    if (!summary.actionResultCompleted) missing.push("completed tool result")
    if (!summary.finalMessageCompleted) missing.push("final model completion")
    if (!summary.turnCompleted) missing.push("turn.completed")
    if (missing.length > 0) {
      throw new Error(
        `Eve ${label} stream did not prove ${missing.join(", ")}. Summary: ${JSON.stringify(summary)}`,
      )
    }
    return summary
  } finally {
    clearTimeout(timeout)
  }
}

async function* readNdjsonEvents(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) yield JSON.parse(line)
      }
    }
    const tail = buffer.trim()
    if (tail) yield JSON.parse(tail)
  } finally {
    reader.releaseLock()
  }
}

function stringOf(value, key) {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value[key]
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : undefined
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
