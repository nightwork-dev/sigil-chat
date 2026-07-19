export interface ImageEditRequest {
  readonly sourceBytes: Uint8Array
  readonly sourceMediaType: string
  readonly instruction: string
  readonly width: number
  readonly height: number
  readonly signal: AbortSignal
  readonly env: Readonly<Record<string, string | undefined>>
}

export interface ImageEditResult {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly backend: string
  readonly revisedPrompt?: string
}

export type ImageEditProvider = (
  request: ImageEditRequest,
) => Promise<ImageEditResult>

interface GatewayImageResponse {
  data?: Array<{
    b64_json?: string
    url?: string
    signed_url?: string
    revised_prompt?: string
  }>
  pending?: { asset_id?: string; status?: string; message?: string }
  error?: { message?: string }
}

/**
 * Use the existing local AI gateway's instruction-edit endpoint. This function
 * has intentionally no text-to-image fallback: an edit request either returns
 * bytes derived from the supplied source or fails with a loud backend error.
 */
export const editImageThroughGateway: ImageEditProvider = async (request) => {
  const baseUrl = (
    request.env.SIGIL_IMAGE_EDIT_GATEWAY_URL ??
    request.env.GONK_GATEWAY_URL ??
    "http://localhost:4000"
  ).replace(/\/+$/, "")
  const apiKey =
    request.env.SIGIL_IMAGE_EDIT_GATEWAY_KEY ??
    request.env.GONK_GATEWAY_API_KEY ??
    request.env.GATEWAY_API_KEY

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  })
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/images/edits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: request.instruction,
        references: [
          {
            base64: Buffer.from(request.sourceBytes).toString("base64"),
            label: "source image",
          },
        ],
        preset:
          request.env.SIGIL_IMAGE_EDIT_PRESET ??
          request.env.GONK_GATEWAY_IMAGE_EDIT_PRESET ??
          "flux2klein4b",
        quality: request.env.SIGIL_IMAGE_EDIT_QUALITY ?? "fast",
        size: `${request.width}x${request.height}`,
      }),
      signal: request.signal,
    })
  } catch (error) {
    throw backendFailure(baseUrl, error)
  }

  const text = await response.text()
  const payload = parseGatewayResponse(text)
  if (response.status === 202 || payload.pending) {
    const pending = payload.pending
    throw new Error(
      `Image edit backend accepted the edit but did not finish it${pending?.asset_id ? ` (asset ${pending.asset_id})` : ""}. ${pending?.message ?? "No derived image is available yet."} No text-to-image fallback was attempted.`,
    )
  }
  if (!response.ok) {
    const detail =
      payload.error?.message ?? (text.slice(0, 500) || "unknown error")
    throw new Error(
      `Image edit backend failed at ${baseUrl} (HTTP ${response.status}): ${detail}. No text-to-image fallback was attempted.`,
    )
  }

  const item = payload.data?.[0]
  if (!item) {
    throw new Error(
      `Image edit backend at ${baseUrl} returned no derived image. No text-to-image fallback was attempted.`,
    )
  }

  const backend =
    response.headers.get("x-gateway-backend-id") ?? "local-gateway"
  if (item.b64_json) {
    return {
      bytes: new Uint8Array(Buffer.from(item.b64_json, "base64")),
      mediaType: "image/png",
      backend,
      ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
    }
  }

  const url = item.url ?? item.signed_url
  if (!url) {
    throw new Error(
      `Image edit backend at ${baseUrl} returned neither image bytes nor a downloadable URL. No text-to-image fallback was attempted.`,
    )
  }
  let imageResponse: Response
  try {
    imageResponse = await fetch(new URL(url, baseUrl), {
      signal: request.signal,
    })
  } catch (error) {
    throw backendFailure(baseUrl, error)
  }
  if (!imageResponse.ok) {
    throw new Error(
      `Image edit backend returned an unreadable derived image (HTTP ${imageResponse.status}). No text-to-image fallback was attempted.`,
    )
  }
  return {
    bytes: new Uint8Array(await imageResponse.arrayBuffer()),
    mediaType: imageResponse.headers.get("content-type") ?? "image/png",
    backend,
    ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
  }
}

function parseGatewayResponse(text: string): GatewayImageResponse {
  try {
    return JSON.parse(text) as GatewayImageResponse
  } catch {
    return {}
  }
}

function backendFailure(baseUrl: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(
    `Image edit backend is unavailable at ${baseUrl}: ${message}. No text-to-image fallback was attempted.`,
  )
}
