import { afterEach, describe, expect, it, vi } from "vitest"

import {
  APP_SERVER_CAPABILITIES,
  APP_SERVER_CLIENT_INFO,
  APP_SERVER_METHODS,
  APP_SERVER_NOTIFICATIONS,
  CODEX_APP_SERVER_ARGS,
  CODEX_BIN_ENV_VAR,
  DEFAULT_CODEX_BIN,
  REALTIME_CONVERSATION_VERSION,
  REALTIME_OUTPUT_MODALITY,
  REALTIME_TRANSPORT_TYPE,
  RealtimeAppServerClient,
  resolveCodexBinary,
  type AppServerChild,
  type RealtimeAppServerDiagnostic,
  type SpawnAppServer,
} from "./realtime-appserver"

const OFFER_SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER_SDP = "v=0\r\na=ice-lite\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const THREAD_ID = "thread_abc123"

type ChildEvent = "exit" | "error"

class FakeAppServerChild implements AppServerChild {
  writes: string[] = []
  killSignals: (NodeJS.Signals | undefined)[] = []

  #stdoutListeners: ((chunk: unknown) => void)[] = []
  #stderrListeners: ((chunk: unknown) => void)[] = []
  #exitListeners: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = []
  #errorListeners: ((error: Error) => void)[] = []

  stdin = {
    write: (chunk: string) => {
      this.writes.push(chunk)
      return true
    },
    end: () => undefined,
  }

  stdout = {
    on: (_event: "data", listener: (chunk: unknown) => void) => {
      this.#stdoutListeners.push(listener)
      return this
    },
  }

  stderr = {
    on: (_event: "data", listener: (chunk: unknown) => void) => {
      this.#stderrListeners.push(listener)
      return this
    },
  }

  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: "error", listener: (error: Error) => void): unknown
  on(event: ChildEvent, listener: (...args: never[]) => void): unknown {
    if (event === "exit") {
      this.#exitListeners.push(listener as never)
    } else {
      this.#errorListeners.push(listener as never)
    }
    return this
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killSignals.push(signal)
    return true
  }

  emitStdout(text: string): void {
    for (const listener of [...this.#stdoutListeners]) listener(Buffer.from(text))
  }

  emitStderr(text: string): void {
    for (const listener of [...this.#stderrListeners]) listener(Buffer.from(text))
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    for (const listener of [...this.#exitListeners]) listener(code, signal)
  }

  emitError(error: Error): void {
    for (const listener of [...this.#errorListeners]) listener(error)
  }

  /** Every JSON-RPC message the client wrote to stdin, in order. */
  sent(): Record<string, unknown>[] {
    return this.writes
      .join("")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  }

  sentMethods(): string[] {
    return this.sent().map((message) => message.method as string)
  }

  lastRequest(method: string): Record<string, unknown> {
    const message = [...this.sent()].reverse().find((entry) => entry.method === method)
    if (!message) throw new Error(`no ${method} request was written`)
    return message
  }
}

interface Harness {
  child: FakeAppServerChild
  client: RealtimeAppServerClient
  diagnostics: RealtimeAppServerDiagnostic[]
  spawnCalls: { binary: string; args: readonly string[] }[]
  /** Respond to the pending request for `method` with a JSON-RPC result. */
  respond: (method: string, result: Record<string, unknown>) => void
  respondError: (method: string, message: string) => void
  notify: (method: string, params: Record<string, unknown>) => void
}

function createHarness(
  options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal; startTimeoutMs?: number } = {},
): Harness {
  const child = new FakeAppServerChild()
  const diagnostics: RealtimeAppServerDiagnostic[] = []
  const spawnCalls: { binary: string; args: readonly string[] }[] = []
  const spawn: SpawnAppServer = (binary, args) => {
    spawnCalls.push({ binary, args })
    return child
  }
  const client = new RealtimeAppServerClient({
    spawn,
    env: options.env ?? {},
    signal: options.signal,
    startTimeoutMs: options.startTimeoutMs,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })

  const idFor = (method: string): number => child.lastRequest(method).id as number

  return {
    child,
    client,
    diagnostics,
    spawnCalls,
    respond: (method, result) => {
      child.emitStdout(`${JSON.stringify({ jsonrpc: "2.0", id: idFor(method), result })}\n`)
    },
    respondError: (method, message) => {
      child.emitStdout(
        `${JSON.stringify({ jsonrpc: "2.0", id: idFor(method), error: { code: -32000, message } })}\n`,
      )
    },
    notify: (method, params) => {
      child.emitStdout(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
    },
  }
}

/** Flush pending microtasks without advancing the (possibly faked) clock. */
async function settle(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0)
    return
  }
  await new Promise((resolve) => setImmediate(resolve))
}

/** Walk the verified handshake, letting each request settle before the next. */
async function driveHandshake(harness: Harness): Promise<void> {
  await settle()
  expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.initialize)
  harness.respond(APP_SERVER_METHODS.initialize, { userAgent: { name: "codex" } })
  await settle()
  expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.threadStart)
  harness.respond(APP_SERVER_METHODS.threadStart, { thread: { id: THREAD_ID } })
  await settle()
  expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.realtimeStart)
}

afterEach(() => {
  vi.useRealTimers()
})

describe("realtime app-server client", () => {
  it("spawns the codex binary with the realtime app-server flags", async () => {
    const harness = createHarness({ env: { [CODEX_BIN_ENV_VAR]: "  /opt/codex  " } })
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })
    await started

    expect(harness.spawnCalls).toHaveLength(1)
    expect(harness.spawnCalls[0]?.binary).toBe("/opt/codex")
    expect(harness.spawnCalls[0]?.args).toEqual([...CODEX_APP_SERVER_ARGS])
    harness.client.dispose()
  })

  it("falls back to the default binary when the env var is unset or blank", () => {
    expect(resolveCodexBinary({})).toBe(DEFAULT_CODEX_BIN)
    expect(resolveCodexBinary({ [CODEX_BIN_ENV_VAR]: "   " })).toBe(DEFAULT_CODEX_BIN)
    expect(resolveCodexBinary({ [CODEX_BIN_ENV_VAR]: " codex-alpha " })).toBe("codex-alpha")
  })

  it("drives initialize → thread/start → thread/realtime/start and resolves the answer SDP", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })

    await expect(started).resolves.toEqual({ threadId: THREAD_ID, answerSdp: ANSWER_SDP })
    expect(harness.child.sentMethods()).toEqual([
      APP_SERVER_METHODS.initialize,
      APP_SERVER_METHODS.threadStart,
      APP_SERVER_METHODS.realtimeStart,
    ])
    expect(harness.child.lastRequest(APP_SERVER_METHODS.initialize).params).toEqual({
      clientInfo: APP_SERVER_CLIENT_INFO,
      capabilities: APP_SERVER_CAPABILITIES,
    })
    harness.client.dispose()
  })

  it("sends the v3 + audio + webrtc invariants and never a session model", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)

    const params = harness.child.lastRequest(APP_SERVER_METHODS.realtimeStart).params as Record<
      string,
      unknown
    >
    expect(params.version).toBe(REALTIME_CONVERSATION_VERSION)
    expect(params.outputModality).toBe(REALTIME_OUTPUT_MODALITY)
    expect(params.threadId).toBe(THREAD_ID)
    expect(params.transport).toEqual({ type: REALTIME_TRANSPORT_TYPE, sdp: OFFER_SDP })
    expect(Object.keys(params)).not.toContain("model")

    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })
    await started
    harness.client.dispose()
  })

  it("leaves attestation to codex by not declaring requestAttestation", () => {
    expect(Object.keys(APP_SERVER_CAPABILITIES)).not.toContain("requestAttestation")
  })

  it("parses NDJSON split across chunks and several messages in one chunk", async () => {
    const harness = createHarness()
    const notifications: string[] = []
    harness.client.subscribe((notification) => notifications.push(notification.method))
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)

    const startedNotification = JSON.stringify({
      jsonrpc: "2.0",
      method: APP_SERVER_NOTIFICATIONS.started,
      params: { threadId: THREAD_ID, version: REALTIME_CONVERSATION_VERSION },
    })
    const sdpNotification = JSON.stringify({
      jsonrpc: "2.0",
      method: APP_SERVER_NOTIFICATIONS.sdp,
      params: { threadId: THREAD_ID, sdp: ANSWER_SDP },
    })

    // One frame arrives split mid-token; the next chunk closes it and carries a
    // second complete frame behind it.
    const combined = `${startedNotification}\n${sdpNotification}\n`
    const splitAt = startedNotification.length - 12
    harness.child.emitStdout(combined.slice(0, splitAt))
    harness.child.emitStdout(combined.slice(splitAt))

    await expect(started).resolves.toEqual({ threadId: THREAD_ID, answerSdp: ANSWER_SDP })
    expect(notifications).toEqual([APP_SERVER_NOTIFICATIONS.started, APP_SERVER_NOTIFICATIONS.sdp])
    harness.client.dispose()
  })

  it("fans notifications out to subscribers until they unsubscribe", async () => {
    const harness = createHarness()
    const seen: string[] = []
    const unsubscribe = harness.client.subscribe((notification) => seen.push(notification.method))
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)

    harness.notify(APP_SERVER_NOTIFICATIONS.transcriptDelta, {
      threadId: THREAD_ID,
      role: "assistant",
      delta: "hel",
    })
    unsubscribe()
    harness.notify(APP_SERVER_NOTIFICATIONS.transcriptDone, {
      threadId: THREAD_ID,
      role: "assistant",
      text: "hello",
    })
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })

    await started
    expect(seen).toEqual([APP_SERVER_NOTIFICATIONS.transcriptDelta])
    harness.client.dispose()
  })

  it("rejects the pending start when realtime/error arrives before the SDP", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.notify(APP_SERVER_NOTIFICATIONS.error, {
      threadId: THREAD_ID,
      message: "Voice session access denied",
    })

    await expect(started).rejects.toThrow("Voice session access denied")
    harness.client.dispose()
  })

  it("rejects when thread/realtime/start returns a JSON-RPC error", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.respondError(APP_SERVER_METHODS.realtimeStart, "unknown variant v3")

    await expect(started).rejects.toThrow("unknown variant v3")
    harness.client.dispose()
  })

  it("rejects the pending start when the child exits before an answer", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.child.emitExit(1, null)

    await expect(started).rejects.toThrow(/exited before completing/)
    expect(harness.diagnostics).toContainEqual({ type: "child-exit", code: 1, signal: null })
    harness.client.dispose()
  })

  it("surfaces malformed lines and stderr as diagnostics without stopping the loop", async () => {
    const harness = createHarness()
    const seen: string[] = []
    harness.client.subscribe((notification) => seen.push(notification.method))
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)

    harness.child.emitStderr("warning: experimental api\n")
    harness.child.emitStdout("{not json at all}\n")
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })

    await expect(started).resolves.toMatchObject({ answerSdp: ANSWER_SDP })
    expect(seen).toEqual([APP_SERVER_NOTIFICATIONS.sdp])
    expect(harness.diagnostics.map((diagnostic) => diagnostic.type)).toEqual(
      expect.arrayContaining(["stderr", "malformed-line"]),
    )
  })

  it("sends stop and appendText with the started thread id", async () => {
    const harness = createHarness()
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })
    await started

    const appended = harness.client.appendText("hello there", "user")
    await settle()
    expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.realtimeAppendText)
    expect(harness.child.lastRequest(APP_SERVER_METHODS.realtimeAppendText).params).toEqual({
      threadId: THREAD_ID,
      text: "hello there",
      role: "user",
    })
    harness.respond(APP_SERVER_METHODS.realtimeAppendText, {})
    await appended

    const stopped = harness.client.stop()
    await settle()
    expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.realtimeStop)
    expect(harness.child.lastRequest(APP_SERVER_METHODS.realtimeStop).params).toEqual({
      threadId: THREAD_ID,
    })
    harness.respond(APP_SERVER_METHODS.realtimeStop, {})
    await stopped
    harness.client.dispose()
  })

  it("refuses to append before a thread has started", async () => {
    const harness = createHarness()
    await expect(harness.client.appendText("hi")).rejects.toThrow("No realtime thread has been started")
  })

  it("tears down on abort: child killed, pending start rejected, no timers left", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const harness = createHarness({ signal: controller.signal, startTimeoutMs: 30_000 })
    const started = harness.client.start(OFFER_SDP)
    const rejection = expect(started).rejects.toThrow(/aborted/)
    await settle()
    expect(harness.child.sentMethods()).toContain(APP_SERVER_METHODS.initialize)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    controller.abort()

    // Checked synchronously: teardown itself has to kill the child and clear
    // the deadline, not the start promise's own cleanup a microtask later.
    expect(harness.child.killSignals).toEqual(["SIGTERM"])
    expect(vi.getTimerCount()).toBe(0)
    expect(harness.client.disposed).toBe(true)

    await rejection
    // Nothing fires after teardown, including the start deadline.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears the start deadline once the answer settles", async () => {
    vi.useFakeTimers()
    const harness = createHarness({ startTimeoutMs: 30_000 })
    const started = harness.client.start(OFFER_SDP)
    await driveHandshake(harness)
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })
    await started

    expect(vi.getTimerCount()).toBe(0)
    harness.client.dispose()
  })

  it("rejects the start when the answer does not arrive before the deadline", async () => {
    vi.useFakeTimers()
    const harness = createHarness({ startTimeoutMs: 5_000 })
    const started = harness.client.start(OFFER_SDP)
    const rejection = expect(started).rejects.toThrow(/Timed out after 5000ms/)
    await driveHandshake(harness)

    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
    harness.client.dispose()
  })

  it("refuses a second start while one is in flight instead of stranding the first", async () => {
    const harness = createHarness()
    const first = harness.client.start(OFFER_SDP)

    await expect(harness.client.start(OFFER_SDP)).rejects.toThrow(
      /already in flight/,
    )

    // The first caller is unharmed by the refusal: the handshake still
    // completes and its answer still arrives.
    await driveHandshake(harness)
    harness.respond(APP_SERVER_METHODS.realtimeStart, {})
    harness.notify(APP_SERVER_NOTIFICATIONS.sdp, { threadId: THREAD_ID, sdp: ANSWER_SDP })
    await expect(first).resolves.toEqual({ threadId: THREAD_ID, answerSdp: ANSWER_SDP })
  })

  it("rejects use after dispose", async () => {
    const harness = createHarness()
    harness.client.dispose()
    await expect(harness.client.start(OFFER_SDP)).rejects.toThrow("disposed")
  })
})
