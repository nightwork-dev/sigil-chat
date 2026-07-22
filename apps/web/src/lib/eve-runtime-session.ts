import { useCallback, useMemo, useRef } from "react"
import {
  createDataUrlFilePart,
  type EveAgentStoreSnapshot,
  type EveMessage,
  type EveMessageData,
  type EveMessagePart,
  type SendTurnPayload,
} from "eve/client"
import {
  useEveAgent,
  type UseEveAgentHelpers,
  type UseEveAgentOptions,
  type UseEveAgentStatus,
} from "eve/react"

import type {
  AgentMessage,
  AgentMessagePart,
  AgentRuntimeSession,
  AgentSendAttachment,
  AgentTurnResult,
} from "@zigil/agent-surface/contracts"

type UseEveRuntimeSessionOptions = Omit<
  UseEveAgentOptions<EveMessageData>,
  "reducer"
>
type EveRuntimeSendInput = Parameters<
  UseEveAgentHelpers<EveMessageData>["send"]
>[0]
type EveFinishedTurn = Pick<
  EveAgentStoreSnapshot<EveMessageData>,
  "error" | "status"
> | null

interface EveRuntimeSessionSource {
  readonly data: EveMessageData
  readonly error: Error | null | undefined
  readonly status: UseEveAgentStatus
  execute(input: EveRuntimeSendInput): Promise<{
    readonly finished: EveFinishedTurn
    readonly cancelled: boolean
  }>
  reset(): void
  stop(): void
}

/**
 * Temporary phase-1 compatibility seam between Eve's native client and the
 * existing Sigil agent UI contract. Keep app policy here; do not republish it.
 * The Eve-native migration spec deletes this adapter in phase 2.
 */
export function useEveRuntimeSession(
  options: UseEveRuntimeSessionOptions = {},
): AgentRuntimeSession {
  const lastFinishedRef = useRef<EveFinishedTurn>(null)
  const cancelledRef = useRef(false)
  const onFinishRef = useRef(options.onFinish)
  onFinishRef.current = options.onFinish

  const eve = useEveAgent({
    ...options,
    onFinish: (snapshot) => {
      lastFinishedRef.current = snapshot
      onFinishRef.current?.(snapshot)
    },
  })

  const execute = useCallback(
    async (input: EveRuntimeSendInput) => {
      lastFinishedRef.current = null
      cancelledRef.current = false
      await eve.send(input)
      return {
        finished: lastFinishedRef.current,
        cancelled: cancelledRef.current,
      }
    },
    [eve],
  )

  const stop = useCallback(() => {
    cancelledRef.current = true
    eve.stop()
  }, [eve])

  return useMemo(
    () =>
      createEveRuntimeSession({
        data: eve.data,
        error: eve.error,
        status: eve.status,
        execute,
        reset: eve.reset,
        stop,
      }),
    [eve.data, eve.error, eve.reset, eve.status, execute, stop],
  )
}

export function createEveRuntimeSession(
  source: EveRuntimeSessionSource,
): AgentRuntimeSession {
  const runTurn = async (
    input: EveRuntimeSendInput,
  ): Promise<AgentTurnResult> => {
    try {
      const result = await source.execute(input)
      return resolveEveTurnResult(result.finished, result.cancelled)
    } catch (error) {
      return { status: "failed", error: runtimeError(error) }
    }
  }

  return {
    capabilities: {
      approvals: true,
      authorization: true,
      reset: true,
      stop: true,
      streaming: true,
      toolInput: true,
    },
    data: { messages: source.data.messages.map(mapEveMessage) },
    ...(source.error ? { error: source.error } : {}),
    reset: source.reset,
    respondToToolInput: (responses) => runTurn({ inputResponses: responses }),
    send: async ({ attachments, clientContext, headers, message }) =>
      runTurn({
        clientContext,
        headers,
        message: await toEveSendMessage(message, attachments),
      }),
    stop: source.stop,
    status: mapEveStatus(source.status),
  }
}

export async function toEveSendMessage(
  message: string,
  attachments?: readonly AgentSendAttachment[],
): Promise<NonNullable<SendTurnPayload["message"]>> {
  if (!attachments || attachments.length === 0) return message

  const content: Exclude<NonNullable<SendTurnPayload["message"]>, string> = []
  if (message) content.push({ type: "text", text: message })
  for (const attachment of attachments) {
    content.push(...(await toInlineParts(attachment)))
  }
  return content
}

async function toInlineParts(
  attachment: AgentSendAttachment,
): Promise<Exclude<NonNullable<SendTurnPayload["message"]>, string>> {
  const filename = attachment.filename
  if (attachment.url.startsWith("data:")) {
    return [
      {
        type: "file",
        data: attachment.url,
        mediaType: attachment.mediaType,
        ...(filename ? { filename } : {}),
      },
    ]
  }

  let bytes: Uint8Array
  try {
    const response = await fetch(attachment.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    return [
      {
        type: "text",
        text: `[Attachment ${filename ?? attachment.url} could not be read.]`,
      },
    ]
  }

  if (isTextualAttachment(attachment.mediaType, attachment.url)) {
    return [
      {
        type: "text",
        text: renderTextAttachment(
          filename ?? filenameFromUrl(attachment.url),
          new TextDecoder("utf-8", { fatal: false }).decode(bytes),
        ),
      },
    ]
  }

  return [
    createDataUrlFilePart({
      bytes,
      mediaType: attachment.mediaType,
      ...(filename ? { filename } : {}),
    }),
  ]
}

const TEXTUAL_EXTENSIONS = new Set([
  "c",
  "cpp",
  "css",
  "csv",
  "go",
  "h",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "markdown",
  "md",
  "ndjson",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "text",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])
const TEXTUAL_MEDIA_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/markdown",
  "application/toml",
  "application/x-ndjson",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])
const MAX_TEXT_CHARS = 200_000

function isTextualAttachment(mediaType: string, url: string): boolean {
  const type = mediaType.toLowerCase()
  if (type.startsWith("text/")) return true
  if (type.endsWith("+json") || type.endsWith("+xml")) return true
  if (TEXTUAL_MEDIA_TYPES.has(type)) return true
  const extension = extensionFromUrl(url)
  return extension !== undefined && TEXTUAL_EXTENSIONS.has(extension)
}

function renderTextAttachment(filename: string, content: string): string {
  const truncated = content.length > MAX_TEXT_CHARS
  const body = truncated ? content.slice(0, MAX_TEXT_CHARS) : content
  const note = truncated
    ? `\n\n[…truncated at ${MAX_TEXT_CHARS} characters]`
    : ""
  return `Attached file: ${filename}\n\n\`\`\`\n${body}${note}\n\`\`\``
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const match = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)
    return match?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

function filenameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).at(-1)
    return last ? decodeURIComponent(last) : "attachment"
  } catch {
    return "attachment"
  }
}

export function mapEveMessage(message: EveMessage): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map(mapEvePart).filter(isAgentMessagePart),
  }
}

export function mapEvePart(part: EveMessagePart): AgentMessagePart | undefined {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text }
    case "dynamic-tool":
      return mapToolCall(part)
    case "authorization":
      return {
        type: "authorization",
        id: `${part.turnId}:${part.stepIndex}:${part.name}`,
        state: part.state,
        displayName: part.displayName,
        description: part.description,
        ...(part.state === "completed" ? { outcome: part.outcome } : {}),
        ...(part.authorization?.url
          ? { authorizationUrl: part.authorization.url }
          : {}),
      }
    case "reasoning":
      return {
        type: "reasoning",
        text: part.text,
        ...(part.state ? { state: part.state } : {}),
      }
    case "file":
      return {
        type: "file",
        mediaType: part.mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
        ...(part.size === undefined ? {} : { size: part.size }),
        ...(part.url ? { url: part.url } : {}),
      }
    case "step-start":
      return undefined
  }
}

function mapToolCall(
  part: Extract<EveMessagePart, { type: "dynamic-tool" }>,
): AgentMessagePart {
  const metadata = part.toolMetadata?.eve
  return {
    type: "tool-call",
    id: part.toolCallId,
    name: metadata?.name ?? part.toolName,
    kind: mapToolKind(metadata?.kind),
    state: part.state,
    input: part.input,
    ...(part.state === "output-available" ? { output: part.output } : {}),
    ...(part.state === "output-error" ? { errorText: part.errorText } : {}),
    ...(metadata?.inputRequest
      ? {
          inputRequest: {
            requestId: metadata.inputRequest.requestId,
            prompt: metadata.inputRequest.prompt,
            options: metadata.inputRequest.options?.map((option) => ({
              id: option.id,
              label: option.label,
              ...(option.style ? { style: option.style } : {}),
            })),
          },
        }
      : {}),
    ...(metadata?.inputResponse
      ? { inputResponse: metadata.inputResponse }
      : {}),
  }
}

function isAgentMessagePart(
  part: AgentMessagePart | undefined,
): part is AgentMessagePart {
  return part !== undefined
}

function mapToolKind(
  kind: "load-skill" | "subagent-call" | "tool-call" | "unknown" | undefined,
): "skill-call" | "subagent-call" | "tool-call" | undefined {
  switch (kind) {
    case "tool-call":
    case "subagent-call":
      return kind
    case "load-skill":
      return "skill-call"
    default:
      return undefined
  }
}

function mapEveStatus(
  status: UseEveAgentStatus,
): AgentRuntimeSession["status"] {
  return status === "ready" ? "idle" : status
}

function runtimeError(error: unknown): { message: string } {
  return {
    message: error instanceof Error ? error.message : "The agent turn failed.",
  }
}

export function resolveEveTurnResult(
  finished: EveFinishedTurn,
  cancelled: boolean,
): AgentTurnResult {
  if (cancelled) return { status: "cancelled" }
  if (finished?.status === "error") {
    return {
      status: "failed",
      error: runtimeError(
        finished.error ?? new Error("The agent turn failed."),
      ),
    }
  }
  return { status: "succeeded" }
}
