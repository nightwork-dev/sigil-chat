/**
 * React hook wrapping the streamSSE client.
 *
 * Provides: sendMessage, stop, isStreaming, plus content/thinking
 * accumulation via callbacks. The caller manages message state;
 * this hook manages the streaming lifecycle.
 *
 * Usage:
 *   const { sendMessage, isStreaming, stop } = useChatStream()
 *
 *   sendMessage({
 *     url: "/api/chat",
 *     body: { messages, temperature: 0.7, stream: true },
 *     onChunk(content, thinking) { updateMessage(content, thinking) },
 *     onDone() { saveSession() },
 *     onError(err) { showError(err) },
 *   })
 */

import { useRef, useState, useCallback } from "react"
import { streamSSE, type StreamCallbacks } from "@workspace/chat/lib/streaming"

export interface SendMessageParams {
  /** Fetch URL (e.g. "/api/chat") */
  url: string
  /** JSON body to POST */
  body: Record<string, unknown>
  /** Whether thinking mode is enabled */
  thinkingEnabled?: boolean
  /** Called with accumulated content + thinking on each chunk */
  onChunk: StreamCallbacks["onChunk"]
  /** Called when stream completes */
  onDone: StreamCallbacks["onDone"]
  /** Called on error */
  onError: StreamCallbacks["onError"]
  /** Called with raw metrics */
  onMetrics?: StreamCallbacks["onMetrics"]
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (params: SendMessageParams) => {
    // Abort any in-flight stream
    abortRef.current?.abort()

    const abort = new AbortController()
    abortRef.current = abort
    setIsStreaming(true)

    await streamSSE(
      {
        url: params.url,
        body: params.body,
        signal: abort.signal,
        thinkingEnabled: params.thinkingEnabled,
      },
      {
        onChunk: params.onChunk,
        onDone: () => {
          setIsStreaming(false)
          abortRef.current = null
          params.onDone()
        },
        onError: (err) => {
          setIsStreaming(false)
          abortRef.current = null
          params.onError(err)
        },
        onMetrics: params.onMetrics,
      },
    )
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  return { sendMessage, isStreaming, stop } as const
}
