import { spawn as spawnChildProcess } from "node:child_process"

/**
 * Realtime voice over Codex's app-server.
 *
 * `codex app-server --stdio` speaks JSON-RPC 2.0 over NDJSON and exposes the
 * experimental `thread/realtime/*` surface. Codex performs the WebRTC call
 * setup with its own subscription OAuth and attestation, so no credential ever
 * passes through this process: we forward the browser's offer SDP and hand the
 * answer back.
 *
 * The wire contract below is verified (2026-07-25, codex 0.146.0-alpha) and
 * recorded in docs/specs/REALTIME-VOICE-AND-BACKGROUND-AGENT-SPEC.md; the
 * param shapes match `codex app-server generate-json-schema` v2.
 */

export const CODEX_BIN_ENV_VAR = "SIGIL_CODEX_BIN"
export const DEFAULT_CODEX_BIN = "codex"

/**
 * `mcp_servers={}` keeps startup free of unrelated MCP launches; the feature
 * flag is what exposes the realtime methods at all.
 */
export const CODEX_APP_SERVER_ARGS = [
  "app-server",
  "--stdio",
  "-c",
  "features.realtime_conversation=true",
  "-c",
  "mcp_servers={}",
] as const

/** v1 is backend-denied (403) and v2 rejects webrtc; v3 is the only working dialect. */
export const REALTIME_CONVERSATION_VERSION = "v3"
/** Text output requires realtime v2, so audio is the only modality on this path. */
export const REALTIME_OUTPUT_MODALITY = "audio"
export const REALTIME_TRANSPORT_TYPE = "webrtc"

export const APP_SERVER_CLIENT_INFO = {
  name: "sigil-chat",
  title: "Sigil Chat",
  version: "0.0.1",
} as const

/**
 * `requestAttestation` is deliberately absent: leaving it unset makes codex
 * supply its own attestation instead of asking us for one we cannot produce.
 */
export const APP_SERVER_CAPABILITIES = { experimentalApi: true } as const

export const APP_SERVER_METHODS = {
  initialize: "initialize",
  threadStart: "thread/start",
  realtimeStart: "thread/realtime/start",
  realtimeStop: "thread/realtime/stop",
  realtimeAppendText: "thread/realtime/appendText",
  realtimeAppendSpeech: "thread/realtime/appendSpeech",
  realtimeListVoices: "thread/realtime/listVoices",
} as const

export const APP_SERVER_NOTIFICATIONS = {
  sdp: "thread/realtime/sdp",
  error: "thread/realtime/error",
  started: "thread/realtime/started",
  itemAdded: "thread/realtime/itemAdded",
  closed: "thread/realtime/closed",
  transcriptDelta: "thread/realtime/transcript/delta",
  transcriptDone: "thread/realtime/transcript/done",
  outputAudioDelta: "thread/realtime/outputAudio/delta",
} as const

export const DEFAULT_START_TIMEOUT_MS = 30_000

export type RealtimeTextRole = "user" | "developer" | "assistant"

export interface AppServerReadableStream {
  on(event: "data", listener: (chunk: unknown) => void): unknown
}

export interface AppServerWritableStream {
  write(chunk: string): unknown
  end?(): unknown
}

export interface AppServerChild {
  stdin: AppServerWritableStream
  stdout: AppServerReadableStream
  stderr?: AppServerReadableStream | null
  kill(signal?: NodeJS.Signals): unknown
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: "error", listener: (error: Error) => void): unknown
}

export type SpawnAppServer = (
  binary: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv },
) => AppServerChild

export interface AppServerNotification {
  method: string
  params: Record<string, unknown>
}

export type RealtimeAppServerDiagnostic =
  | { type: "malformed-line"; line: string; reason: string }
  | { type: "stderr"; text: string }
  | { type: "unmatched-response"; id: string | number }
  | { type: "unhandled-server-request"; method: string; id: string | number }
  | { type: "listener-error"; method: string; reason: string }
  | { type: "child-exit"; code: number | null; signal: NodeJS.Signals | null }
  | { type: "child-error"; reason: string }

export interface RealtimeAppServerOptions {
  spawn?: SpawnAppServer
  env?: NodeJS.ProcessEnv
  clientInfo?: { name: string; title: string; version: string }
  startTimeoutMs?: number
  onDiagnostic?: (diagnostic: RealtimeAppServerDiagnostic) => void
  signal?: AbortSignal
}

export interface RealtimeStartOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Developer context injected at session start. Containment, not prompt
   *  engineering: the live-voice host uses it to truthfully name the current
   *  agent boundary (see docs/specs/LIVE-VOICE-HARNESS-ASSESSMENT, P0). */
  prompt?: string
}

export interface RealtimeStartResult {
  threadId: string
  answerSdp: string
}

export class RealtimeAppServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RealtimeAppServerError"
  }
}

/** The configured codex binary, trimmed; empty or unset falls back to `codex`. */
export function resolveCodexBinary(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[CODEX_BIN_ENV_VAR]?.trim()
  return configured ? configured : DEFAULT_CODEX_BIN
}

interface PendingRequest {
  method: string
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
}

interface RealtimeAnswerWaiter {
  resolve: (sdp: string) => void
  reject: (error: Error) => void
}

const defaultSpawn: SpawnAppServer = (binary, args, options) =>
  spawnChildProcess(binary, [...args], {
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  })

export class RealtimeAppServerClient {
  #options: RealtimeAppServerOptions
  #spawn: SpawnAppServer
  #child: AppServerChild | undefined
  #buffer = ""
  #nextId = 1
  #pending = new Map<number, PendingRequest>()
  #subscribers = new Set<(notification: AppServerNotification) => void>()
  #timers = new Set<ReturnType<typeof setTimeout>>()
  #answerWaiter: RealtimeAnswerWaiter | undefined
  #threadId: string | undefined
  #disposed = false
  #abortListener: (() => void) | undefined

  constructor(options: RealtimeAppServerOptions = {}) {
    this.#options = options
    this.#spawn = options.spawn ?? defaultSpawn
    if (options.signal) this.#attachAbort(options.signal)
  }

  get threadId(): string | undefined {
    return this.#threadId
  }

  get disposed(): boolean {
    return this.#disposed
  }

  /** Subscribe to every server notification. Returns the unsubscribe function. */
  subscribe(listener: (notification: AppServerNotification) => void): () => void {
    this.#subscribers.add(listener)
    return () => {
      this.#subscribers.delete(listener)
    }
  }

  /**
   * Drive initialize → thread/start → thread/realtime/start and resolve once
   * codex notifies the answer SDP. A `thread/realtime/error` notification (or
   * a JSON-RPC error, child exit, abort, or timeout) rejects instead.
   */
  async start(offerSdp: string, options: RealtimeStartOptions = {}): Promise<RealtimeStartResult> {
    this.#assertUsable()
    if (this.#answerWaiter) {
      // A second start would silently replace the first waiter and strand its
      // caller forever — refuse loudly instead. One client, one session.
      throw new RealtimeAppServerError("A realtime start is already in flight.")
    }
    if (options.signal) this.#attachAbort(options.signal)

    const timeoutMs = options.timeoutMs ?? this.#options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS
    const answer = this.#awaitAnswerSdp()
    const timer = this.#setTimer(() => {
      this.#failStart(
        new RealtimeAppServerError(`Timed out after ${timeoutMs}ms waiting for the realtime answer SDP.`),
      )
    }, timeoutMs)

    try {
      // The handshake never rejects on its own: every failure is funnelled into
      // the answer waiter, so `answer` is the single channel this await settles
      // on and no losing branch is left rejecting into nobody's hands.
      void this.#handshake(offerSdp, options.prompt).catch((error: unknown) => {
        const failure = error instanceof Error ? error : new RealtimeAppServerError(String(error))
        if (this.#answerWaiter) this.#failStart(failure)
        else this.#diagnose({ type: "child-error", reason: failure.message })
      })

      const answerSdp = await answer
      return { threadId: this.#threadId as string, answerSdp }
    } finally {
      this.#clearTimer(timer)
      this.#answerWaiter = undefined
    }
  }

  async #handshake(offerSdp: string, prompt?: string): Promise<void> {
    this.#ensureChild()
    await this.#request(APP_SERVER_METHODS.initialize, {
      clientInfo: this.#options.clientInfo ?? APP_SERVER_CLIENT_INFO,
      capabilities: APP_SERVER_CAPABILITIES,
    })
    const thread = await this.#request(APP_SERVER_METHODS.threadStart, {})
    const threadId = readThreadId(thread)
    if (!threadId) {
      throw new RealtimeAppServerError("thread/start returned no thread id.")
    }
    this.#threadId = threadId
    // No `model`: the backend rejects explicit session models for Codex
    // realtime, and version v3 is what makes the WebRTC call admissible.
    await this.#request(APP_SERVER_METHODS.realtimeStart, {
      threadId,
      outputModality: REALTIME_OUTPUT_MODALITY,
      version: REALTIME_CONVERSATION_VERSION,
      transport: { type: REALTIME_TRANSPORT_TYPE, sdp: offerSdp },
      ...(prompt ? { prompt } : {}),
    })
  }

  async stop(): Promise<void> {
    const threadId = this.#requireThreadId()
    await this.#request(APP_SERVER_METHODS.realtimeStop, { threadId })
  }

  async appendText(text: string, role?: RealtimeTextRole): Promise<void> {
    const threadId = this.#requireThreadId()
    await this.#request(APP_SERVER_METHODS.realtimeAppendText, {
      threadId,
      text,
      ...(role ? { role } : {}),
    })
  }

  async appendSpeech(text: string): Promise<void> {
    const threadId = this.#requireThreadId()
    await this.#request(APP_SERVER_METHODS.realtimeAppendSpeech, { threadId, text })
  }

  async listVoices(): Promise<Record<string, unknown>> {
    this.#assertUsable()
    this.#ensureChild()
    return this.#request(APP_SERVER_METHODS.realtimeListVoices, {})
  }

  /** Tear everything down: kill the child, reject pending work, clear timers. */
  dispose(reason?: string): void {
    if (this.#disposed) return
    this.#disposed = true

    const error = new RealtimeAppServerError(
      reason ?? "The realtime app-server client was disposed.",
    )
    this.#rejectAll(error)

    for (const timer of this.#timers) clearTimeout(timer)
    this.#timers.clear()

    this.#subscribers.clear()
    if (this.#options.signal && this.#abortListener) {
      this.#options.signal.removeEventListener("abort", this.#abortListener)
    }
    this.#abortListener = undefined

    const child = this.#child
    this.#child = undefined
    child?.kill("SIGTERM")
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new RealtimeAppServerError("The realtime app-server client was disposed.")
    }
  }

  #requireThreadId(): string {
    this.#assertUsable()
    if (!this.#threadId) {
      throw new RealtimeAppServerError("No realtime thread has been started.")
    }
    return this.#threadId
  }

  #attachAbort(signal: AbortSignal): void {
    if (signal.aborted) {
      this.dispose("The realtime app-server client was aborted.")
      return
    }
    const listener = () => this.dispose("The realtime app-server client was aborted.")
    this.#abortListener = listener
    signal.addEventListener("abort", listener, { once: true })
  }

  #ensureChild(): AppServerChild {
    if (this.#child) return this.#child
    const child = this.#spawn(resolveCodexBinary(this.#options.env), CODEX_APP_SERVER_ARGS, {
      env: this.#options.env ?? process.env,
    })
    this.#child = child

    child.stdout.on("data", (chunk) => this.#consume(String(chunk)))
    child.stderr?.on("data", (chunk) =>
      this.#diagnose({ type: "stderr", text: String(chunk) }),
    )
    child.on("exit", (code, signal) => {
      this.#diagnose({ type: "child-exit", code, signal })
      this.#child = undefined
      this.#rejectAll(
        new RealtimeAppServerError(
          `The codex app-server exited before completing the request (code ${code ?? "null"}, signal ${signal ?? "null"}).`,
        ),
      )
    })
    child.on("error", (error) => {
      this.#diagnose({ type: "child-error", reason: error.message })
      this.#rejectAll(new RealtimeAppServerError(`The codex app-server failed to run: ${error.message}`))
    })
    return child
  }

  #request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const child = this.#ensureChild()
    const id = this.#nextId++
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject })
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
      } catch (error) {
        this.#pending.delete(id)
        reject(
          new RealtimeAppServerError(
            `Failed to write ${method} to the codex app-server: ${(error as Error).message}`,
          ),
        )
      }
    })
  }

  #awaitAnswerSdp(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.#answerWaiter = { resolve, reject }
    })
  }

  #failStart(error: Error): void {
    this.#answerWaiter?.reject(error)
    this.#answerWaiter = undefined
    for (const [id, pending] of this.#pending) {
      this.#pending.delete(id)
      pending.reject(error)
    }
  }

  #rejectAll(error: Error): void {
    this.#failStart(error)
  }

  #consume(text: string): void {
    this.#buffer += text
    let newline = this.#buffer.indexOf("\n")
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline)
      this.#buffer = this.#buffer.slice(newline + 1)
      if (line.trim()) this.#handleLine(line)
      newline = this.#buffer.indexOf("\n")
    }
  }

  #handleLine(line: string): void {
    let message: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (!parsed || typeof parsed !== "object") throw new Error("not a JSON-RPC object")
      message = parsed as Record<string, unknown>
    } catch (error) {
      // Malformed frames are a diagnostic, never an exception thrown into the
      // stdout listener — one bad line must not stop the notification loop.
      this.#diagnose({ type: "malformed-line", line, reason: (error as Error).message })
      return
    }
    this.#handleMessage(message)
  }

  #handleMessage(message: Record<string, unknown>): void {
    const method = typeof message.method === "string" ? message.method : undefined
    const id = message.id as string | number | undefined

    if (method) {
      if (id !== undefined) {
        this.#diagnose({ type: "unhandled-server-request", method, id })
        return
      }
      this.#handleNotification({
        method,
        params: (message.params as Record<string, unknown> | undefined) ?? {},
      })
      return
    }

    if (id === undefined || typeof id !== "number") return
    const pending = this.#pending.get(id)
    if (!pending) {
      this.#diagnose({ type: "unmatched-response", id: id as string | number })
      return
    }
    this.#pending.delete(id)
    if (message.error) {
      const error = message.error as { message?: string; code?: number }
      pending.reject(
        new RealtimeAppServerError(
          `${pending.method} failed: ${error.message ?? JSON.stringify(message.error)}`,
        ),
      )
      // A failed realtime start can never produce an answer.
      if (pending.method === APP_SERVER_METHODS.realtimeStart) {
        this.#answerWaiter?.reject(
          new RealtimeAppServerError(
            `${pending.method} failed: ${error.message ?? JSON.stringify(message.error)}`,
          ),
        )
        this.#answerWaiter = undefined
      }
      return
    }
    pending.resolve((message.result as Record<string, unknown> | undefined) ?? {})
  }

  #handleNotification(notification: AppServerNotification): void {
    if (notification.method === APP_SERVER_NOTIFICATIONS.sdp) {
      const sdp = notification.params.sdp
      if (typeof sdp === "string" && this.#answerWaiter) {
        this.#answerWaiter.resolve(sdp)
        this.#answerWaiter = undefined
      }
    } else if (notification.method === APP_SERVER_NOTIFICATIONS.error) {
      const message =
        typeof notification.params.message === "string"
          ? notification.params.message
          : JSON.stringify(notification.params)
      this.#failStart(new RealtimeAppServerError(`Realtime session error: ${message}`))
    }

    for (const listener of this.#subscribers) {
      try {
        listener(notification)
      } catch (error) {
        this.#diagnose({
          type: "listener-error",
          method: notification.method,
          reason: (error as Error).message,
        })
      }
    }
  }

  #setTimer(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.#timers.delete(timer)
      callback()
    }, ms)
    this.#timers.add(timer)
    return timer
  }

  #clearTimer(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer)
    this.#timers.delete(timer)
  }

  #diagnose(diagnostic: RealtimeAppServerDiagnostic): void {
    this.#options.onDiagnostic?.(diagnostic)
  }
}

function readThreadId(result: Record<string, unknown>): string | undefined {
  if (typeof result.threadId === "string") return result.threadId
  const thread = result.thread as { id?: unknown } | undefined
  return typeof thread?.id === "string" ? thread.id : undefined
}
