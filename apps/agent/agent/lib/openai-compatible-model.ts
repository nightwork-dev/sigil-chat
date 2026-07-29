import type {
  LanguageModel,
} from "ai"

export interface OpenAICompatibleModelOptions {
  readonly apiKey?: string
  readonly baseUrl: string
  readonly fetch?: typeof fetch
  readonly model: string
  readonly provider?: string
}

interface OpenAICompatibleMessage {
  readonly role: "system" | "user" | "assistant" | "tool"
  readonly content?: string
  readonly tool_call_id?: string
  readonly tool_calls?: readonly OpenAICompatibleToolCall[]
}

interface OpenAICompatibleToolCall {
  readonly id: string
  readonly type: "function"
  readonly function: {
    readonly name: string
    readonly arguments: string
  }
}

interface OpenAICompatibleChatChoice {
  readonly delta?: {
    readonly content?: string
  }
  readonly finish_reason?: string | null
  readonly message?: {
    readonly content?: string | null
    readonly tool_calls?: readonly OpenAICompatibleToolCall[]
  }
}

interface OpenAICompatibleChatResponse {
  readonly id?: string
  readonly created?: number
  readonly model?: string
  readonly choices?: readonly OpenAICompatibleChatChoice[]
  readonly usage?: {
    readonly completion_tokens?: number
    readonly prompt_tokens?: number
    readonly total_tokens?: number
  }
}

type OpenAICompatiblePromptMessage =
  | { readonly role: "system"; readonly content: string }
  | {
      readonly role: "user"
      readonly content: readonly OpenAICompatiblePromptPart[]
    }
  | {
      readonly role: "assistant"
      readonly content: readonly OpenAICompatiblePromptPart[]
    }
  | {
      readonly role: "tool"
      readonly content: readonly {
        readonly result: unknown
        readonly toolCallId: string
      }[]
    }

type OpenAICompatiblePromptPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool-call"
      readonly toolCallId: string
      readonly toolName: string
      readonly input: string
    }
  | { readonly type: string; readonly [key: string]: unknown }

interface OpenAICompatibleCallOptions {
  readonly abortSignal?: AbortSignal
  readonly maxOutputTokens?: number
  readonly prompt: readonly OpenAICompatiblePromptMessage[]
  readonly stopSequences?: readonly string[]
  readonly temperature?: number
  readonly tools?: readonly Record<string, unknown>[]
  readonly topP?: number
}

interface OpenAICompatibleGenerateResult {
  readonly content: readonly Record<string, unknown>[]
  readonly finishReason: OpenAICompatibleFinishReason
  readonly request?: { readonly body?: unknown }
  readonly response?: Record<string, unknown>
  readonly usage: OpenAICompatibleUsage
  readonly warnings: readonly unknown[]
}

type OpenAICompatibleStreamPart = Record<string, unknown>

interface OpenAICompatibleFinishReason {
  readonly unified:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other"
  readonly raw?: string
}

interface OpenAICompatibleUsage {
  readonly inputTokens: {
    readonly total?: number
    readonly noCache?: number
    readonly cacheRead?: number
    readonly cacheWrite?: number
  }
  readonly outputTokens: {
    readonly total?: number
    readonly text?: number
    readonly reasoning?: number
  }
  readonly raw?: Record<string, unknown>
}

export function createOpenAICompatibleChatModel(
  options: OpenAICompatibleModelOptions,
): LanguageModel {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetcher = options.fetch ?? fetch
  const provider = options.provider ?? "openai-compatible"

  return {
    specificationVersion: "v4",
    provider,
    modelId: options.model,
    supportedUrls: {},
    async doGenerate(
      callOptions: OpenAICompatibleCallOptions,
    ): Promise<OpenAICompatibleGenerateResult> {
      const body = buildChatCompletionBody(options.model, callOptions, false)
      const { response, value } = await postChatCompletion({
        apiKey: options.apiKey,
        baseUrl,
        body,
        fetcher,
        signal: callOptions.abortSignal,
      })
      const choice = value.choices?.[0]
      const content = []
      const text = choice?.message?.content
      if (typeof text === "string" && text.length > 0) {
        content.push({ type: "text" as const, text })
      }
      for (const toolCall of choice?.message?.tool_calls ?? []) {
        content.push({
          type: "tool-call" as const,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
        })
      }
      return {
        content,
        finishReason: finishReason(choice?.finish_reason),
        usage: usage(value.usage),
        warnings: [],
        request: { body },
        response: {
          body: value,
          headers: responseHeaders(response.headers),
          ...(value.id ? { id: value.id } : {}),
          ...(typeof value.created === "number"
            ? { timestamp: new Date(value.created * 1000) }
            : {}),
          ...(value.model ? { modelId: value.model } : {}),
        },
      }
    },
    async doStream(callOptions: OpenAICompatibleCallOptions) {
      const body = buildChatCompletionBody(options.model, callOptions, true)
      const response = await fetcher(chatCompletionsUrl(baseUrl), {
        body: JSON.stringify(body),
        headers: requestHeaders(options.apiKey),
        method: "POST",
        signal: callOptions.abortSignal,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          `${provider} chat completion stream failed with HTTP ${response.status}.`,
        )
      }
      return {
        stream: response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(createSseToLanguageModelStream()),
        request: { body },
        response: { headers: responseHeaders(response.headers) },
      }
    },
  } as unknown as LanguageModel
}

function buildChatCompletionBody(
  model: string,
  options: OpenAICompatibleCallOptions,
  stream: boolean,
): Record<string, unknown> {
  return withoutUndefined({
    model,
    messages: options.prompt.map(projectMessage),
    max_tokens: options.maxOutputTokens,
    temperature: options.temperature,
    top_p: options.topP,
    stop: options.stopSequences,
    stream,
    tools: options.tools?.map((tool: Record<string, unknown>) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: "inputSchema" in tool ? tool.inputSchema : tool.parameters,
      },
    })),
  })
}

function projectMessage(
  message: OpenAICompatiblePromptMessage,
): OpenAICompatibleMessage {
  if (message.role === "system") {
    return { role: "system", content: message.content }
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content
        .map((part) => JSON.stringify(part.result))
        .join("\n"),
      tool_call_id: message.content[0]?.toolCallId,
    }
  }
  if (message.role === "assistant") {
    const toolCalls: OpenAICompatibleToolCall[] = []
    const text: string[] = []
    for (const part of message.content) {
      if (isTextPart(part)) text.push(part.text)
      if (isToolCallPart(part)) {
        toolCalls.push({
          id: part.toolCallId,
          type: "function",
          function: {
            name: part.toolName,
            arguments: part.input,
          },
        })
      }
    }
    return withoutUndefined({
      role: "assistant",
      content: text.join("\n"),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    }) as unknown as OpenAICompatibleMessage
  }
  return {
    role: "user",
    content: message.content
      .flatMap((part) => (isTextPart(part) ? [part.text] : []))
      .join("\n"),
  }
}

function isTextPart(
  part: OpenAICompatiblePromptPart,
): part is { readonly type: "text"; readonly text: string } {
  return part.type === "text" && typeof part.text === "string"
}

function isToolCallPart(
  part: OpenAICompatiblePromptPart,
): part is {
  readonly type: "tool-call"
  readonly toolCallId: string
  readonly toolName: string
  readonly input: string
} {
  return (
    part.type === "tool-call" &&
    typeof part.toolCallId === "string" &&
    typeof part.toolName === "string" &&
    typeof part.input === "string"
  )
}

async function postChatCompletion({
  apiKey,
  baseUrl,
  body,
  fetcher,
  signal,
}: {
  readonly apiKey?: string
  readonly baseUrl: string
  readonly body: Record<string, unknown>
  readonly fetcher: typeof fetch
  readonly signal?: AbortSignal
}): Promise<{
  readonly response: Response
  readonly value: OpenAICompatibleChatResponse
}> {
  const response = await fetcher(chatCompletionsUrl(baseUrl), {
    body: JSON.stringify(body),
    headers: requestHeaders(apiKey),
    method: "POST",
    signal,
  })
  if (!response.ok) {
    throw new Error(
      `OpenAI-compatible chat completion failed with HTTP ${response.status}.`,
    )
  }
  return {
    response,
    value: (await response.json()) as OpenAICompatibleChatResponse,
  }
}

function createSseToLanguageModelStream() {
  let started = false
  let ended = false
  return new TransformStream<string, OpenAICompatibleStreamPart>({
    transform(chunk, controller) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const data = trimmed.slice(5).trim()
        if (data === "[DONE]") {
          closeText(controller)
          continue
        }
        const parsed = JSON.parse(data) as OpenAICompatibleChatResponse
        const delta = parsed.choices?.[0]?.delta?.content
        if (typeof delta === "string" && delta.length > 0) {
          if (!started) {
            started = true
            controller.enqueue({ type: "text-start", id: "text" })
          }
          controller.enqueue({ type: "text-delta", id: "text", delta })
        }
        const finish = parsed.choices?.[0]?.finish_reason
        if (finish) {
          closeText(controller)
          controller.enqueue({
            type: "finish",
            finishReason: finishReason(finish),
            usage: usage(parsed.usage),
          })
        }
      }
    },
    flush(controller) {
      if (!ended) {
        closeText(controller)
        controller.enqueue({
          type: "finish",
          finishReason: finishReason(undefined),
          usage: usage(),
        })
      }
    },
  })

  function closeText(
    controller: TransformStreamDefaultController<OpenAICompatibleStreamPart>,
  ) {
    if (!started || ended) return
    controller.enqueue({ type: "text-end", id: "text" })
    ended = true
  }
}

function finishReason(
  raw: string | null | undefined,
): OpenAICompatibleFinishReason {
  const unified =
    raw === "stop"
      ? "stop"
      : raw === "length"
        ? "length"
        : raw === "content_filter"
          ? "content-filter"
          : raw === "tool_calls"
            ? "tool-calls"
            : raw === undefined || raw === null
              ? "other"
              : "other"
  return { unified, raw: raw ?? undefined }
}

function usage(raw?: OpenAICompatibleChatResponse["usage"]): OpenAICompatibleUsage {
  return {
    inputTokens: {
      total: raw?.prompt_tokens,
      noCache: raw?.prompt_tokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: raw?.completion_tokens,
      text: raw?.completion_tokens,
      reasoning: undefined,
    },
    ...(raw ? { raw: raw as Record<string, unknown> } : {}),
  }
}

function requestHeaders(apiKey: string | undefined): Headers {
  const headers = new Headers({ "content-type": "application/json" })
  if (apiKey !== undefined) headers.set("authorization", `Bearer ${apiKey}`)
  return headers
}

function responseHeaders(headers: Headers): Record<string, string> {
  const entries: Record<string, string> = {}
  headers.forEach((value, key) => {
    entries[key] = value
  })
  return entries
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl}/chat/completions`
}

function withoutUndefined(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  )
}
