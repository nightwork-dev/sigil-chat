// Small pure helpers for reasoning about image URLs by their file extension —
// used by paste/attachment flows to decide "is this pasted text an image link?"
// and to derive display metadata for a URL added by reference (no upload, so no
// server-provided content-type). Extension is a heuristic: content-type can't be
// checked synchronously, and anything ambiguous should fall through to normal
// handling rather than be forced into an image.

const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
  "ico",
] as const

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
}

/** The lowercased file extension of a URL's path, if any (no leading dot). */
export function extensionFromUrl(url: string): string | undefined {
  try {
    const { pathname } = new URL(url)
    const match = /\.([a-z0-9]+)$/i.exec(pathname)
    return match ? match[1]?.toLowerCase() : undefined
  } catch {
    return undefined
  }
}

/** True when `text` is a lone http(s) URL whose path ends in an image
 *  extension — the conservative "this is an image link, attach it" test. */
export function isImageUrl(text: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(text)) return false
  const ext = extensionFromUrl(text)
  return ext !== undefined && (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** Best-effort image media type from a URL's extension; falls back to the
 *  generic `image/*` when the extension is missing or unknown. */
export function imageMediaTypeFromUrl(url: string): string {
  const ext = extensionFromUrl(url)
  return (ext && EXTENSION_MEDIA_TYPES[ext]) ?? "image/*"
}

/** The last path segment of a URL, for use as an attachment's display name. */
export function filenameFromUrl(url: string, fallback = "attachment"): string {
  try {
    const { pathname } = new URL(url)
    const last = pathname.split("/").filter(Boolean).at(-1)
    return last && last.length > 0 ? decodeURIComponent(last) : fallback
  } catch {
    return fallback
  }
}
