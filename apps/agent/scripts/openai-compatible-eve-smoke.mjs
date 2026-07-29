import { spawn } from "node:child_process"
import { once } from "node:events"
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, "..")
const projectDirectory = resolve(appDirectory, "../..")
const bindingSecret = "sigil-local-openai-compatible-smoke-secret"
const fixtureDirectory = mkdtempSync(
  join(tmpdir(), "sigil-eve-openai-compatible-smoke-"),
)
const eveOutput = []
let child
let fakeProvider

try {
  fakeProvider = await startFakeOpenAICompatibleProvider()
  copyAppFixture(fixtureDirectory, fakeProvider.baseUrl)

  const port = await reservePort()
  child = spawn(
    join(appDirectory, "node_modules", ".bin", "eve"),
    ["dev", "--no-ui", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: fixtureDirectory,
      env: {
        ...process.env,
        SIGIL_AGENT_BINDING_SECRET: bindingSecret,
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
      applicationThreadId: "thread-local-openai-compatible-smoke",
      expiresAt: Math.floor(Date.now() / 1_000) + 60,
      homeScopeId: "workspace-local-smoke",
      initialPerspective: {
        focusScopeId: "workspace-local-smoke",
        viaScopeIds: ["project-local-smoke"],
      },
      personaId: "sigil-chat-eve",
      subject: "local-dev",
    },
    bindingSecret,
  )
  const response = await fetch(`http://127.0.0.1:${port}/eve/v1/session`, {
    body: JSON.stringify({
      message:
        "Use the todo tool once to record that local OpenAI-compatible smoke ran, then say local smoke complete.",
    }),
    headers: {
      [AGENT_SESSION_BINDING_HEADER]: proof,
      "content-type": "application/json",
    },
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(
      `Eve local OpenAI-compatible session POST returned HTTP ${response.status}: ${await response.text()}`,
    )
  }

  await fakeProvider.waitForRequests(2)
  const [first, second] = fakeProvider.requests
  const toolNames = toolNamesFromRequest(first)
  if (first.model !== "local-openai-compatible-smoke") {
    throw new Error(
      `Fake provider received unexpected model id ${JSON.stringify(first.model)}`,
    )
  }
  if (!toolNames.includes("todo")) {
    throw new Error(
      `Eve model request did not include the native todo tool. Tools: ${JSON.stringify(toolNames)}`,
    )
  }
  if (!hasToolResult(second)) {
    throw new Error(
      `Eve did not send the todo tool result back to the model. Second request: ${JSON.stringify(sanitizeRequest(second))}`,
    )
  }

  console.log(
    "Eve local OpenAI-compatible smoke passed: POST /eve/v1/session reached the official provider adapter, exposed the native todo tool, executed it, and sent the tool result back to the model",
  )
} catch (error) {
  if (eveOutput.length > 0) {
    console.error(eveOutput.join("").slice(-20_000))
  }
  throw error
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await once(child, "exit")
  }
  await fakeProvider?.close()
  rmSync(fixtureDirectory, { force: true, recursive: true })
}

function copyAppFixture(targetDirectory, providerBaseUrl) {
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
      "    provider: openai-compatible",
      "    model: local-openai-compatible-smoke",
      `    baseUrl: ${providerBaseUrl}`,
      "    contextWindowTokens: 4096",
    ].join("\n"),
  )
  writeFileSync(fixturePath, fixture)
}

async function startFakeOpenAICompatibleProvider() {
  const requests = []
  const waiters = []
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end()
      return
    }
    try {
      const body = JSON.parse(await readRequestBody(request))
      requests.push(body)
      flushWaiters()
      if (body.stream) {
        writeStreamingCompletion(response, requests.length)
      } else {
        writeJsonCompletion(response, requests.length)
      }
    } catch (error) {
      response
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: { message: error.message } }))
    }
  })
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    throw new Error("Could not bind fake OpenAI-compatible provider")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      ),
    waitForRequests: async (count) => {
      const deadline = Date.now() + 30_000
      while (requests.length < count) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          throw new Error(
            `Timed out waiting for ${count} provider requests; received ${requests.length}`,
          )
        }
        await new Promise((resolvePromise) => {
          const timeout = setTimeout(resolvePromise, Math.min(remaining, 250))
          waiters.push(() => {
            clearTimeout(timeout)
            resolvePromise()
          })
        })
      }
    },
  }

  function flushWaiters() {
    while (waiters.length > 0) waiters.shift()?.()
  }
}

function writeJsonCompletion(response, requestNumber) {
  response.writeHead(200, { "content-type": "application/json" })
  if (requestNumber === 1) {
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            index: 0,
            message: {
              content: null,
              role: "assistant",
              tool_calls: [todoToolCall()],
            },
          },
        ],
        created: 0,
        id: "chatcmpl-local-smoke-1",
        model: "local-openai-compatible-smoke",
        object: "chat.completion",
      }),
    )
    return
  }
  response.end(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: { content: "local smoke complete", role: "assistant" },
        },
      ],
      created: 0,
      id: "chatcmpl-local-smoke-2",
      model: "local-openai-compatible-smoke",
      object: "chat.completion",
      usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 },
    }),
  )
}

function writeStreamingCompletion(response, requestNumber) {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream; charset=utf-8",
  })
  if (requestNumber === 1) {
    writeSse(response, {
      choices: [
        {
          delta: {
            role: "assistant",
            tool_calls: [todoToolCall()],
          },
          finish_reason: "tool_calls",
          index: 0,
        },
      ],
      created: 0,
      id: "chatcmpl-local-smoke-1",
      model: "local-openai-compatible-smoke",
      object: "chat.completion.chunk",
    })
  } else {
    writeSse(response, {
      choices: [
        {
          delta: { content: "local smoke complete", role: "assistant" },
          finish_reason: "stop",
          index: 0,
        },
      ],
      created: 0,
      id: "chatcmpl-local-smoke-2",
      model: "local-openai-compatible-smoke",
      object: "chat.completion.chunk",
      usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 },
    })
  }
  response.write("data: [DONE]\n\n")
  response.end()
}

function todoToolCall() {
  return {
    function: {
      arguments: JSON.stringify({
        todos: [
          {
            content: "local OpenAI-compatible smoke ran",
            priority: "low",
            status: "completed",
          },
        ],
      }),
      name: "todo",
    },
    id: "call_local_smoke_todo",
    type: "function",
  }
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function toolNamesFromRequest(request) {
  return (request.tools ?? [])
    .map((tool) => tool?.function?.name ?? tool?.name)
    .filter((name) => typeof name === "string")
}

function hasToolResult(request) {
  return (request.messages ?? []).some(
    (message) =>
      message?.role === "tool" ||
      (message?.role === "assistant" && Array.isArray(message.tool_calls)),
  )
}

function sanitizeRequest(request) {
  return {
    messages: request?.messages?.map((message) => ({ role: message.role })),
    model: request?.model,
    stream: request?.stream,
    tools: toolNamesFromRequest(request),
  }
}

function readRequestBody(request) {
  return new Promise((resolvePromise, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => resolvePromise(body))
    request.on("error", reject)
  })
}

function capture(chunk) {
  eveOutput.push(String(chunk))
  if (eveOutput.length > 200) eveOutput.shift()
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
    throw new Error("Could not reserve a loopback port for the Eve smoke")
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
