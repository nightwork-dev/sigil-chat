import { loadSigilConfigFixture } from "@workspace/runtime-env/config"

// The image provider is application-owned; the agent host only supplies it.

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
  pending?: unknown
}

const MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024
const MAX_GATEWAY_RESPONSE_BYTES = 24 * 1024 * 1024
const MAX_REDIRECTS = 3
const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

/**
 * Use the existing local AI gateway's instruction-edit endpoint. This function
 * has intentionally no text-to-image fallback: an edit request either returns
 * bytes derived from the supplied source or fails with a loud backend error.
 */
export const editImageThroughGateway: ImageEditProvider = async (request) => {
  const { value: sigilConfig } = await loadSigilConfigFixture()
  const baseUrl = (
    request.env.SIGIL_IMAGE_EDIT_GATEWAY_URL ?? "http://localhost:4000"
  ).replace(/\/+$/, "")
  const gatewayUrl = requireHttpUrl(baseUrl)
  const allowedOrigins = new Set([gatewayUrl.origin])
  for (const configured of (
    request.env.SIGIL_IMAGE_EDIT_DOWNLOAD_ORIGINS ?? ""
  ).split(",")) {
    const value = configured.trim()
    if (value) allowedOrigins.add(requireHttpUrl(value).origin)
  }
  const apiKey = request.env.SIGIL_IMAGE_EDIT_GATEWAY_KEY

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  })
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)

  let response: Response
  try {
    response = await fetch(new URL(`${baseUrl}/v1/images/edits`), {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        prompt: request.instruction,
        references: [
          {
            base64: Buffer.from(request.sourceBytes).toString("base64"),
            label: "source image",
          },
        ],
        preset: sigilConfig.imageEdit.preset,
        quality: sigilConfig.imageEdit.quality,
        size: `${request.width}x${request.height}`,
      }),
      signal: request.signal,
    })
  } catch {
    throw backendUnavailable()
  }

  const text = new TextDecoder().decode(
    await readResponseBytes(
      response,
      MAX_GATEWAY_RESPONSE_BYTES,
      "Image edit backend response",
    ),
  )
  const payload = parseGatewayResponse(text)
  if (response.status === 202 || payload.pending) {
    throw new Error(
      "Image edit backend accepted the edit but did not finish it. No text-to-image fallback was attempted.",
    )
  }
  if (!response.ok) {
    throw new Error(
      `Image edit backend rejected the request (HTTP ${response.status}). No text-to-image fallback was attempted.`,
    )
  }

  const item = payload.data?.[0]
  if (!item) {
    throw new Error(
      "Image edit backend returned no derived image. No text-to-image fallback was attempted.",
    )
  }

  const backend =
    response.headers.get("x-gateway-backend-id") ?? "local-gateway"
  if (item.b64_json) {
    const bytes = new Uint8Array(Buffer.from(item.b64_json, "base64"))
    assertWithinLimit(bytes.byteLength, MAX_DOWNLOAD_BYTES, "Derived image")
    const mediaType = detectImageMediaType(bytes)
    if (!mediaType) throw unsupportedImageType()
    return {
      bytes,
      mediaType,
      backend,
      ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
    }
  }

  const url = item.url ?? item.signed_url
  if (!url) {
    throw new Error(
      "Image edit backend returned neither image bytes nor a downloadable URL. No text-to-image fallback was attempted.",
    )
  }
  let imageUrl: URL
  try {
    imageUrl = new URL(url, gatewayUrl)
  } catch {
    throw untrustedLocation()
  }
  const imageResponse = await fetchAllowedImage(
    imageUrl,
    allowedOrigins,
    request.signal,
  )
  if (!imageResponse.ok) {
    throw new Error(
      `Image edit backend returned an unreadable derived image (HTTP ${imageResponse.status}). No text-to-image fallback was attempted.`,
    )
  }
  const mediaType = imageResponse.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (!mediaType || !IMAGE_MEDIA_TYPES.has(mediaType))
    throw unsupportedImageType()
  const bytes = await readResponseBytes(
    imageResponse,
    MAX_DOWNLOAD_BYTES,
    "Derived image",
  )
  if (detectImageMediaType(bytes) !== mediaType) throw unsupportedImageType()
  return {
    bytes,
    mediaType,
    backend,
    ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
  }
}

async function fetchAllowedImage(
  initialUrl: URL,
  allowedOrigins: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<Response> {
  let url = initialUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertAllowedUrl(url, allowedOrigins)
    let response: Response
    try {
      response = await fetch(url, { redirect: "manual", signal })
    } catch {
      throw backendUnavailable()
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    const location = response.headers.get("location")
    if (!location || redirects === MAX_REDIRECTS) {
      throw new Error(
        "Image edit backend returned too many redirects. No text-to-image fallback was attempted.",
      )
    }
    url = new URL(location, url)
  }
  throw new Error(
    "Image edit backend returned too many redirects. No text-to-image fallback was attempted.",
  )
}

function assertAllowedUrl(url: URL, allowedOrigins: ReadonlySet<string>): void {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !allowedOrigins.has(url.origin) ||
    url.username ||
    url.password
  ) {
    throw untrustedLocation()
  }
}

function requireHttpUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Image edit backend configuration is invalid.")
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error("Image edit backend configuration is invalid.")
  }
  return url
}

function untrustedLocation(): Error {
  return new Error(
    "Image edit backend returned an untrusted download location. No text-to-image fallback was attempted.",
  )
}

function unsupportedImageType(): Error {
  return new Error(
    "Image edit backend returned an unsupported image type. No text-to-image fallback was attempted.",
  )
}

function detectImageMediaType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return undefined
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw sizeLimitError(label, maxBytes)
  }
  if (!response.body) return new Uint8Array()

  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw sizeLimitError(label, maxBytes)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function assertWithinLimit(
  size: number,
  maxBytes: number,
  label: string,
): void {
  if (size > maxBytes) throw sizeLimitError(label, maxBytes)
}

function sizeLimitError(label: string, maxBytes: number): Error {
  return new Error(`${label} exceeded the ${maxBytes / 1024 / 1024} MiB limit.`)
}

function parseGatewayResponse(text: string): GatewayImageResponse {
  try {
    return JSON.parse(text) as GatewayImageResponse
  } catch {
    return {}
  }
}

function backendUnavailable(): Error {
  return new Error(
    "Image edit backend is unavailable. No text-to-image fallback was attempted.",
  )
}
