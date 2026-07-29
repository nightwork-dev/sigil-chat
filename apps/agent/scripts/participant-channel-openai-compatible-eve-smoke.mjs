import { createHmac } from "node:crypto"
import { once } from "node:events"
import {
  cpSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { createServer as createNetServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, "..")
const projectDirectory = resolve(appDirectory, "../..")
const fixtureDirectory = mkdtempSync(join(tmpdir(), "sigil-eve-openai-smoke-"))
const bindingSecret = "sigil-eve-openai-compatible-smoke-secret"
const subject = "local-dev"
const personaId = "sigil-chat-eve"
const channelId = "openai-compatible-smoke-channel"
const baseApplicationThreadId = "openai-compatible-smoke-thread"
const output = []
let eveProcess
let provider

try {
  const providerPort = await reservePort()
  provider = await startOpenAiCompatibleProvider(providerPort)
  stageFixture(provider.url)

  const evePort = await reservePort()
  eveProcess = spawn(
    join(fixtureDirectory, "node_modules", ".bin", "eve"),
    ["dev", "--no-ui", "--host", "127.0.0.1", "--port", String(evePort)],
    {
      cwd: fixtureDirectory,
      env: {
        ...process.env,
        OPENAI_COMPATIBLE_SMOKE_BASE_URL: provider.url,
        SIGIL_AGENT_BINDING_SECRET: bindingSecret,
        SIGIL_DATA_DIR: join(fixtureDirectory, ".data"),
        SIGIL_DEFAULT_PERSONA_ID: personaId,
        SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  eveProcess.stdout.on("data", capture)
  eveProcess.stderr.on("data", capture)

  const baseUrl = `http://127.0.0.1:${evePort}`
  await waitForInfoRoute(eveProcess, baseUrl)

  const beforeA = provider.requests.length
  const sessionA = await createPersonaSession(baseUrl, "participant-a", {
    message: "Run OPENAI_SMOKE_TODO for participant-a.",
  })
  const turnA = await consumeTurn(baseUrl, sessionA)
  assertTurnCompletedWithTool(turnA, "participant-a")
  assertProviderRequestsIncreased(provider.requests, beforeA, 2, "participant-a")

  const beforeB = provider.requests.length
  const sessionB = await createPersonaSession(baseUrl, "participant-b", {
    message: "Run OPENAI_SMOKE_TODO for participant-b.",
  })
  const turnB = await consumeTurn(baseUrl, sessionB)
  assertTurnCompletedWithTool(turnB, "participant-b")
  assertProviderRequestsIncreased(provider.requests, beforeB, 2, "participant-b")

  const beforeDormant = provider.requests.length
  await assertDormantParticipantDoesNotDispatch(baseUrl)
  assertEqual(
    provider.requests.length,
    beforeDormant,
    "dormant participant dispatch must not call the provider",
  )

  const beforeCancel = provider.requests.length
  const slowB = await postSessionMessage(baseUrl, sessionB, {
    message: "OPENAI_SMOKE_SLOW_UNAFFECTED for participant-b.",
  })
  assertEqual(slowB.status, 200, "session-b slow continuation should be accepted")
  const streamB = streamTurn(baseUrl, sessionB)
  const startedB = await nextEvent(streamB, (event) => event.type === "turn.started")
  const deniedCrossCancel = await cancelTurnWithProof(
    baseUrl,
    sessionB,
    proof({
      eveSessionId: sessionA.sessionId,
      participantId: sessionA.participantId,
    }),
    startedB.data.turnId,
  )
  assertEqual(
    deniedCrossCancel.status,
    403,
    "session-a proof must not cancel session-b",
  )

  const slowA = await postSessionMessage(baseUrl, sessionA, {
    message: "OPENAI_SMOKE_SLOW_CANCEL for participant-a.",
  })
  assertEqual(slowA.status, 200, "session-a slow continuation should be accepted")
  const streamA = streamTurn(baseUrl, sessionA)
  const startedA = await nextEvent(streamA, (event) => event.type === "turn.started")
  const deniedCreateStyleCancel = await cancelTurnWithProof(
    baseUrl,
    sessionA,
    proof({ participantId: sessionA.participantId }),
    startedA.data.turnId,
  )
  assertEqual(
    deniedCreateStyleCancel.status,
    403,
    "create-style proof must not cancel an existing session",
  )
  const cancelled = await cancelTurn(baseUrl, sessionA, startedA.data.turnId)
  assertEqual(cancelled.status, 202, "observed-turn cancel should be accepted")

  const remainingCancelEvents = await collectUntilBoundary(
    streamTurn(baseUrl, sessionA),
    20_000,
  )
  assertHasEvent(remainingCancelEvents, "turn.cancelled")

  const unaffectedBEvents = await collectUntilBoundary(
    streamTurn(baseUrl, sessionB),
    20_000,
  )
  assertHasEvent(unaffectedBEvents, "turn.completed")
  assertNoEvent(unaffectedBEvents, "turn.cancelled")
  assertEqual(
    provider.requests.length,
    beforeCancel + 2,
    "cancel slice should only add one slow B request and one cancelled A request",
  )
  const slowARequest = provider.requests
    .slice(beforeCancel)
    .find((request) => request.participantId === "participant-a")
  assert(
    slowARequest?.slow === true,
    "the cancelled participant-a turn should have reached the slow provider branch",
  )
  const slowBRequest = provider.requests
    .slice(beforeCancel)
    .find((request) => request.participantId === "participant-b")
  assert(
    slowBRequest?.slow === true,
    "the unaffected participant-b turn should have reached the slow provider branch",
  )

  console.log(
    [
      "OpenAI-compatible Eve smoke passed:",
      `sessions=${sessionA.sessionId},${sessionB.sessionId}`,
      `providerRequests=${provider.requests.length}`,
      "toolLoop=A:todo,B:todo",
      "dormantProviderRequests=0",
      `crossCancelStatus=${deniedCrossCancel.status}`,
      `createStyleCancelStatus=${deniedCreateStyleCancel.status}`,
      `cancelStatus=${cancelled.body.status}`,
      "unaffectedB=completed",
    ].join(" "),
  )
} catch (error) {
  if (output.length > 0) {
    console.error(output.join("").slice(-20_000))
  }
  throw error
} finally {
  if (eveProcess && eveProcess.exitCode === null && eveProcess.signalCode === null) {
    eveProcess.kill("SIGKILL")
    await once(eveProcess, "exit")
  }
  if (provider) await provider.close()
  rmSync(fixtureDirectory, { force: true, recursive: true })
}

function stageFixture(providerUrl) {
  cpSync(join(appDirectory, "agent"), join(fixtureDirectory, "agent"), {
    filter: (source) => !source.split("/").includes(".agents"),
    recursive: true,
  })
  cpSync(join(appDirectory, "package.json"), join(fixtureDirectory, "package.json"))
  cpSync(join(appDirectory, "tsconfig.json"), join(fixtureDirectory, "tsconfig.json"))
  cpSync(join(appDirectory, "scripts"), join(fixtureDirectory, "scripts"), {
    recursive: true,
  })
  cpSync(join(projectDirectory, "fixtures"), join(fixtureDirectory, "fixtures"), {
    recursive: true,
  })
  symlinkSync(join(appDirectory, "node_modules"), join(fixtureDirectory, "node_modules"))

  writeFileSync(
    join(fixtureDirectory, "agent", "agent.ts"),
    `import { defineAgent } from "eve"
import { openAiCompatibleSmokeModel } from "./openai-compatible-smoke-model"

export default defineAgent({
  model: openAiCompatibleSmokeModel(),
  modelContextWindowTokens: 200_000,
  build: {
    externalDependencies: ["better-sqlite3"],
  },
})
`,
  )
  writeFileSync(
    join(fixtureDirectory, "agent", "openai-compatible-smoke-model.ts"),
    smokeModelSource(providerUrl),
  )
}

function smokeModelSource(providerUrl) {
  return `const baseUrl = process.env.OPENAI_COMPATIBLE_SMOKE_BASE_URL ?? ${JSON.stringify(providerUrl)}

export function openAiCompatibleSmokeModel() {
  return {
    specificationVersion: "v2",
    provider: "sigil-smoke-openai-compatible",
    modelId: "sigil-smoke-model",
    supportedUrls: {},
    async doGenerate(options) {
      const body = requestBody(options, false)
      const response = await callProvider(body, options.abortSignal)
      return {
        content: [{ type: "text", text: response.content ?? "" }],
        finishReason: "stop",
        usage: usage(),
        request: { body },
        response: { body: response },
        warnings: [],
      }
    },
    async doStream(options) {
      const body = requestBody(options, true)
      const response = await callProvider(body, options.abortSignal)
      return {
        request: { body },
        response: { body: response },
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] })
            controller.enqueue({
              type: "response-metadata",
              id: response.id ?? crypto.randomUUID(),
              modelId: "sigil-smoke-model",
              timestamp: new Date(),
            })
            if (response.toolCall) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: response.toolCall.id,
                toolName: response.toolCall.name,
                input: JSON.stringify(response.toolCall.input),
              })
              controller.enqueue({
                type: "finish",
                finishReason: "tool-calls",
                usage: usage(),
              })
            } else {
              const id = response.textId ?? crypto.randomUUID()
              const content = response.content ?? ""
              controller.enqueue({ type: "text-start", id })
              controller.enqueue({ type: "text-delta", id, delta: content })
              controller.enqueue({ type: "text-end", id })
              controller.enqueue({
                type: "finish",
                finishReason: "stop",
                usage: usage(),
              })
            }
            controller.close()
          },
        }),
      }
    },
  }
}

function requestBody(options, stream) {
  return {
    model: "sigil-smoke-model",
    stream,
    prompt: options.prompt,
    tools: options.tools ?? [],
  }
}

async function callProvider(body, signal) {
  const response = await fetch(new URL("/v1/chat/completions", baseUrl), {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer sigil-smoke",
      "content-type": "application/json",
    },
    method: "POST",
    signal,
  })
  if (!response.ok) {
    throw new Error(\`Smoke provider returned HTTP \${response.status}: \${await response.text()}\`)
  }
  return await response.json()
}

function usage() {
  return {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
  }
}
`
}

async function startOpenAiCompatibleProvider(port) {
  const requests = []
  const slowResolvers = new Set()
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const chunks = []
      request.on("data", (chunk) => chunks.push(chunk))
      await once(request, "end")
      const bodyText = Buffer.concat(chunks).toString("utf8")
      const body = JSON.parse(bodyText)
      const promptText = JSON.stringify(body.prompt)
      const participantId =
        /participant-a/.test(promptText)
          ? "participant-a"
          : /participant-b/.test(promptText)
            ? "participant-b"
            : /participant-dormant/.test(promptText)
              ? "participant-dormant"
              : "unknown"
      const record = {
        aborted: false,
        body,
        participantId,
        slow: false,
      }
      requests.push(record)
      request.on("close", () => {
        if (!response.writableEnded) record.aborted = true
      })

      const participantRequestNumber =
        requests.filter((entry) => entry.participantId === participantId)
          .length
      const forceSlowFinal =
        participantId === "participant-b" && participantRequestNumber >= 3
      if (
        (participantId === "participant-a" && participantRequestNumber >= 3) ||
        forceSlowFinal
      ) {
        record.slow = true
        await new Promise((resolvePromise) => {
          const timeout = setTimeout(
            resolvePromise,
            forceSlowFinal ? 1_000 : 30_000,
          )
          const resolveSlow = () => {
            clearTimeout(timeout)
            resolvePromise()
          }
          slowResolvers.add(resolveSlow)
        })
        if (record.aborted || response.destroyed) return
      }

      response.setHeader("content-type", "application/json")
      if (
        hasToolResult(body.prompt) ||
        /OPENAI_SMOKE_FINAL_ONLY/.test(promptText) ||
        forceSlowFinal
      ) {
        response.end(
          JSON.stringify({
            content: `final response for ${participantId}`,
            id: crypto.randomUUID(),
          }),
        )
        return
      }
      response.end(
        JSON.stringify({
          id: crypto.randomUUID(),
          toolCall: {
            id: crypto.randomUUID(),
            name: "todo",
            input: {
              todos: [
                {
                  content: `prove provider loop for ${participantId}`,
                  priority: "low",
                  status: "completed",
                },
              ],
            },
          },
        }),
      )
      return
    }

    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ data: [{ id: "sigil-smoke-model" }] }))
      return
    }

    response.statusCode = 404
    response.end("not found")
  })
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolvePromise)
  })
  return {
    requests,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolvePromise, reject) => {
        for (const resolveSlow of slowResolvers) resolveSlow()
        slowResolvers.clear()
        server.closeAllConnections?.()
        server.close((error) => (error ? reject(error) : resolvePromise()))
      }),
  }
}

function hasToolResult(prompt) {
  return JSON.stringify(prompt).includes('"tool-result"')
}

async function createPersonaSession(baseUrl, participantId, body) {
  const response = await fetch(`${baseUrl}/eve/v1/session`, {
    body: JSON.stringify(body),
    headers: requestHeaders(proof({ participantId })),
    method: "POST",
  })
  const parsed = await response.json().catch(() => ({}))
  assertEqual(response.status, 202, `create ${participantId} should be accepted: ${JSON.stringify(parsed)}`)
  return {
    continuationToken: parsed.continuationToken,
    participantId,
    sessionId: parsed.sessionId,
    streamIndex: 0,
  }
}

async function postSessionMessage(baseUrl, session, body) {
  const response = await fetch(`${baseUrl}/eve/v1/session/${encodeURIComponent(session.sessionId)}`, {
    body: JSON.stringify({
      continuationToken: session.continuationToken,
      ...body,
    }),
    headers: requestHeaders(
      proof({
        eveSessionId: session.sessionId,
        participantId: session.participantId,
      }),
    ),
    method: "POST",
  })
  const parsed = await response.json().catch(() => ({}))
  return { body: parsed, status: response.status }
}

async function cancelTurn(baseUrl, session, turnId) {
  return cancelTurnWithProof(
    baseUrl,
    session,
    proof({
      eveSessionId: session.sessionId,
      participantId: session.participantId,
    }),
    turnId,
  )
}

async function cancelTurnWithProof(baseUrl, session, bindingProof, turnId) {
  const response = await fetch(`${baseUrl}/eve/v1/session/${encodeURIComponent(session.sessionId)}/cancel`, {
    body: JSON.stringify({ turnId }),
    headers: requestHeaders(bindingProof),
    method: "POST",
  })
  return { body: await response.json(), status: response.status }
}

async function assertDormantParticipantDoesNotDispatch(baseUrl) {
  const response = await fetch(`${baseUrl}/eve/v1/session`, {
    body: JSON.stringify({ message: "This dormant participant must not run." }),
    headers: requestHeaders(
      proof({
        participantId: "participant-dormant",
        state: "dormant",
      }),
    ),
    method: "POST",
  })
  assertEqual(response.status, 403, "dormant create must be rejected before dispatch")
}

async function consumeTurn(baseUrl, session) {
  const events = await collectUntilBoundary(streamTurn(baseUrl, session), 30_000)
  const waiting = events.find((event) => event.type === "session.waiting")
  if (waiting?.data?.continuationToken) {
    session.continuationToken = waiting.data.continuationToken
  }
  session.streamIndex += events.length
  return { events }
}

async function* streamTurn(baseUrl, session) {
  const response = await fetch(
    `${baseUrl}/eve/v1/session/${encodeURIComponent(session.sessionId)}/stream?startIndex=${session.streamIndex}`,
    {
      headers: requestHeaders(
        proof({
          eveSessionId: session.sessionId,
          participantId: session.participantId,
        }),
      ),
    },
  )
  assertEqual(response.status, 200, `stream ${session.participantId} should open`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let index
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line.length > 0) yield JSON.parse(line)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function nextEvent(events, predicate) {
  for await (const event of events) {
    if (predicate(event)) return event
  }
  throw new Error("event stream ended before expected event")
}

async function collectUntilBoundary(events, timeoutMs) {
  const collected = []
  const timeout = AbortSignal.timeout(timeoutMs)
  for await (const event of abortable(events, timeout)) {
    collected.push(event)
    if (
      event.type === "turn.completed" ||
      event.type === "turn.cancelled" ||
      event.type === "turn.failed" ||
      event.type === "session.failed"
    ) {
      return collected
    }
  }
  throw new Error("event stream ended before turn boundary")
}

async function* abortable(iterable, signal) {
  const iterator = iterable[Symbol.asyncIterator]()
  try {
    for (;;) {
      const next = iterator.next()
      const result = await Promise.race([
        next,
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("timed out waiting for Eve stream")),
            { once: true },
          ),
        ),
      ])
      if (result.done) return
      yield result.value
    }
  } finally {
    await iterator.return?.()
  }
}

function assertTurnCompletedWithTool(turn, participantId) {
  assertHasEvent(turn.events, "turn.started")
  assertHasEvent(turn.events, "actions.requested")
  assertHasEvent(turn.events, "action.result")
  assertHasEvent(turn.events, "message.completed")
  assertHasEvent(turn.events, "turn.completed")
  const text = JSON.stringify(turn.events)
  assert(
    text.includes(`final response for ${participantId}`),
    `final response should be for ${participantId}`,
  )
}

function assertProviderRequestsIncreased(requests, start, expected, participantId) {
  const slice = requests.slice(start)
  assertEqual(slice.length, expected, `${participantId} provider request count`)
  for (const request of slice) {
    assertEqual(request.participantId, participantId, `${participantId} provider attribution`)
  }
}

function assertHasEvent(events, type) {
  assert(
    events.some((event) => event.type === type),
    `expected stream event ${type}`,
  )
}

function assertNoEvent(events, type) {
  assert(
    !events.some((event) => event.type === type),
    `did not expect stream event ${type}`,
  )
}

function requestHeaders(bindingProof) {
  return {
    "content-type": "application/json",
    "x-sigil-session-binding": bindingProof,
  }
}

function proof({ eveSessionId, participantId, state = "active" }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    additionalContextScopeIds: [],
    applicationThreadId: applicationThreadIdFor(participantId),
    audience: "sigil-agent-session-binding",
    channel: channelSnapshot({
      eveSessionId,
      participantId,
      state,
    }),
    expiresAt: now + 60,
    homeScopeId: "session:openai-compatible-smoke-home",
    initialPerspective: {
      focusScopeId: "session:openai-compatible-smoke-home",
      viaScopeIds: [],
    },
    personaId,
    subject,
    version: 1,
    ...(eveSessionId ? { eveSessionId } : {}),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${createHmac("sha256", bindingSecret)
    .update(encoded)
    .digest("base64url")}`
}

function channelSnapshot({ eveSessionId, participantId, state }) {
  return {
    channelId,
    ownerPrincipalId: subject,
    participants: [
      {
        kind: "human",
        participantId: "participant-owner",
        principalId: subject,
        role: "owner",
      },
      personaParticipant("participant-a", participantId === "participant-a" ? eveSessionId : undefined),
      personaParticipant("participant-b", participantId === "participant-b" ? eveSessionId : undefined),
      personaParticipant(
        "participant-dormant",
        participantId === "participant-dormant" ? eveSessionId : undefined,
        participantId === "participant-dormant" ? state : "dormant",
      ),
    ],
  }
}

function personaParticipant(participantId, eveSessionId, state = "active") {
  return {
    applicationThreadId: applicationThreadIdFor(participantId),
    eveSessionId: eveSessionId ?? "__pending__",
    kind: "persona-session",
    participantId,
    personaId,
    principalId: subject,
    role: "participant",
    state,
  }
}

function applicationThreadIdFor(participantId) {
  return `${baseApplicationThreadId}:${participantId}`
}

function capture(chunk) {
  output.push(String(chunk))
  if (output.length > 200) output.shift()
}

async function reservePort() {
  const server = createNetServer()
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("Could not reserve a loopback port")
  }
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  )
  return address.port
}

async function waitForInfoRoute(processHandle, baseUrl) {
  const deadline = Date.now() + Number(process.env.OPENAI_SMOKE_TIMEOUT_MS ?? 90_000)
  let lastProbeFailure = "no response received"

  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `Eve exited before /eve/v1/info was ready (exit ${processHandle.exitCode})`,
      )
    }
    try {
      const response = await fetch(`${baseUrl}/eve/v1/info`)
      if (response.status === 200) return
      lastProbeFailure = `HTTP ${response.status}`
    } catch (error) {
      lastProbeFailure = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }

  throw new Error(`Timed out waiting for Eve info route (${lastProbeFailure})`)
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`)
  }
}
