/**
 * SSE streaming client for OpenAI-compatible chat completions.
 *
 * Handles:
 * - SSE parsing with line buffering
 * - <think>/<\/think> tag extraction (thinking/reasoning content)
 * - Abort support
 * - Metrics events (prefill, throughput, usage)
 *
 * This is transport-agnostic — it streams from any endpoint that speaks
 * the OpenAI chat completions SSE format. The caller provides the
 * fetch URL and payload.
 */

export interface StreamCallbacks {
  /** Called with accumulated content + thinking on each chunk */
  onChunk: (content: string, thinking: string) => void
  /** Called when stream completes normally */
  onDone: () => void
  /** Called on any error (network, HTTP, parse) */
  onError: (err: string) => void
  /** Called with raw metrics objects (prefill, usage, etc.) */
  onMetrics?: (metrics: Record<string, number>) => void
}

export interface StreamOptions {
  /** Fetch URL (e.g. "/api/chat") */
  url: string
  /** JSON body to POST */
  body: Record<string, unknown>
  /** AbortSignal for cancellation */
  signal: AbortSignal
  /** Whether thinking mode is enabled (affects initial parser state) */
  thinkingEnabled?: boolean
}

/**
 * Stream an SSE response from an OpenAI-compatible endpoint.
 * Parses `<think>`/`</think>` tags to separate reasoning from content.
 */
export async function streamSSE(
  options: StreamOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { url, body, signal, thinkingEnabled = false } = options

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    callbacks.onError(`Connection failed: ${err}`)
    return
  }

  if (!response.ok) {
    const text = await response.text()
    try {
      const json = JSON.parse(text)
      callbacks.onError(json.error || `HTTP ${response.status}`)
    } catch {
      callbacks.onError(`HTTP ${response.status}: ${text}`)
    }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError("No response body")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""
  let fullThinking = ""
  let inThink = thinkingEnabled
  let justExitedThink = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (data === "[DONE]") {
          callbacks.onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)

          // Handle metrics events
          if (parsed.metrics) {
            callbacks.onMetrics?.(parsed.metrics)
            continue
          }

          // Handle stop event with usage data
          const finishReason = parsed.choices?.[0]?.finish_reason
          if (finishReason === "stop" && parsed.usage) {
            callbacks.onMetrics?.(parsed.usage)
            continue
          }

          const delta = parsed.choices?.[0]?.delta?.content
          if (delta == null) continue

          let remaining = delta as string
          while (remaining.length > 0) {
            if (inThink) {
              const closeIdx = remaining.indexOf("</think>")
              if (closeIdx !== -1) {
                fullThinking += remaining.slice(0, closeIdx)
                remaining = remaining.slice(closeIdx + 8)
                inThink = false
                justExitedThink = true
              } else {
                fullThinking += remaining
                remaining = ""
              }
            } else {
              // Trim leading whitespace on first content after </think>
              if (justExitedThink && fullContent.length === 0) {
                remaining = remaining.trimStart()
                if (remaining.length === 0) continue
              }
              justExitedThink = false

              const openIdx = remaining.indexOf("<think>")
              if (openIdx !== -1) {
                fullContent += remaining.slice(0, openIdx)
                remaining = remaining.slice(openIdx + 7)
                inThink = true
              } else {
                fullContent += remaining
                remaining = ""
              }
            }
          }

          callbacks.onChunk(fullContent, fullThinking)
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    callbacks.onError(`Stream error: ${err}`)
    return
  }

  callbacks.onDone()
}
