export interface BrandingEnvironment {
  readonly SIGIL_APP_NAME?: string
  readonly SIGIL_APP_TITLE?: string
  readonly SIGIL_APP_DESCRIPTION?: string
  readonly SIGIL_APP_ORIGIN?: string
  readonly SIGIL_BRAND_COLOR?: string
  readonly SIGIL_INSTANCE_LABEL?: string
  readonly SIGIL_SHARE_IMAGE_URL?: string
  readonly PORTLESS_URL?: string
  readonly BETTER_AUTH_URL?: string
}

export interface BrandingContext {
  readonly development: boolean
  readonly worktreeName?: string
}

export interface BrandingConfig {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly origin: string
  readonly accent: string
  readonly instanceLabel?: string
  readonly shareImageUrl: string
  readonly faviconHref: string
  readonly manifestHref: string
}

const DEFAULT_NAME = "Sigil Chat"
const DEFAULT_DESCRIPTION = "An agentic chat workspace built with Sigil and Gonk."
const DEFAULT_ORIGIN = "http://sigil-chat.localhost:1355"
const DEFAULT_ACCENT = "#b58b35"

export function resolveBranding(
  environment: BrandingEnvironment,
  context: BrandingContext,
): BrandingConfig {
  const name = optionalText(environment.SIGIL_APP_NAME) ?? DEFAULT_NAME
  const baseTitle =
    optionalText(environment.SIGIL_APP_TITLE) ??
    `${name} — agentic conversations`
  const description =
    optionalText(environment.SIGIL_APP_DESCRIPTION) ?? DEFAULT_DESCRIPTION
  const instanceLabel = resolveInstanceLabel(environment, context)
  const title = instanceLabel ? `[${instanceLabel}] ${baseTitle}` : baseTitle
  const origin = parseOrigin(
    environment.SIGIL_APP_ORIGIN ??
      environment.PORTLESS_URL ??
      environment.BETTER_AUTH_URL,
  )
  const accent = resolveAccent(environment.SIGIL_BRAND_COLOR, instanceLabel)
  const shareImageUrl = resolvePublicUrl(
    environment.SIGIL_SHARE_IMAGE_URL,
    origin,
    "/icon-512.png",
    "SIGIL_SHARE_IMAGE_URL",
  )

  const base = {
    name,
    title,
    description,
    origin,
    accent,
    ...(instanceLabel ? { instanceLabel } : {}),
    shareImageUrl,
  }

  return {
    ...base,
    faviconHref: svgDataUrl(faviconSvg(base)),
    manifestHref: jsonDataUrl({
      short_name: name,
      name: title,
      icons: [
        {
          src: new URL("/icon-192.png", origin).href,
          type: "image/png",
          sizes: "192x192",
        },
        {
          src: new URL("/icon-512.png", origin).href,
          type: "image/png",
          sizes: "512x512",
        },
        {
          src: new URL("/apple-touch-icon.png", origin).href,
          type: "image/png",
          sizes: "180x180",
        },
      ],
      start_url: origin,
      display: "standalone",
      theme_color: accent,
      background_color: "#0e0d0b",
    }),
  }
}

export function inferWorktreeLabel(worktreeName: string | undefined) {
  const name = optionalText(worktreeName)
  if (!name || name === "sigil-chat") return undefined
  return name.startsWith("sigil-chat-")
    ? name.slice("sigil-chat-".length)
    : name
}

export function siteUrl(config: Pick<BrandingConfig, "origin">, path = "/") {
  return new URL(path, `${config.origin}/`).href
}

function resolveInstanceLabel(
  environment: BrandingEnvironment,
  context: BrandingContext,
) {
  if (Object.hasOwn(environment, "SIGIL_INSTANCE_LABEL")) {
    return optionalText(environment.SIGIL_INSTANCE_LABEL)
  }
  return context.development
    ? (inferPortlessInstanceLabel(environment.PORTLESS_URL) ??
        inferWorktreeLabel(context.worktreeName))
    : undefined
}

function inferPortlessInstanceLabel(value: string | undefined) {
  const candidate = optionalText(value)
  if (!candidate) return undefined
  try {
    const labels = new URL(candidate).hostname.split(".")
    const serviceIndex = labels.findIndex((label) => label === "sigil-chat")
    if (serviceIndex < 1) return undefined
    return labels.slice(0, serviceIndex).join(".") || undefined
  } catch {
    return undefined
  }
}

function resolveAccent(value: string | undefined, instanceLabel?: string) {
  const explicit = optionalText(value)
  if (explicit) {
    if (!/^#[0-9a-f]{6}$/i.test(explicit)) {
      throw new Error("SIGIL_BRAND_COLOR must be a six-digit hex color")
    }
    return explicit.toLowerCase()
  }
  return instanceLabel ? colorFromString(instanceLabel) : DEFAULT_ACCENT
}

function parseOrigin(value: string | undefined) {
  const candidate = optionalText(value) ?? DEFAULT_ORIGIN
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error("SIGIL_APP_ORIGIN must be an absolute HTTP(S) URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SIGIL_APP_ORIGIN must be an absolute HTTP(S) URL")
  }
  parsed.pathname = "/"
  parsed.search = ""
  parsed.hash = ""
  return parsed.href.replace(/\/$/, "")
}

function resolvePublicUrl(
  value: string | undefined,
  origin: string,
  fallback: string,
  name: string,
) {
  try {
    const resolved = new URL(optionalText(value) ?? fallback, `${origin}/`)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      throw new Error()
    }
    return resolved.href
  } catch {
    throw new Error(`${name} must be an absolute or root-relative HTTP(S) URL`)
  }
}

function colorFromString(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  const hue = Math.abs(hash) % 360
  return hslToHex(hue, 68, 56)
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - chroma / 2
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

function faviconSvg(config: {
  readonly name: string
  readonly accent: string
  readonly instanceLabel?: string
}) {
  const label = (config.instanceLabel ?? config.name)
    .trim()
    .slice(0, 1)
    .toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0e0d0b"/><circle cx="32" cy="32" r="22" fill="none" stroke="${config.accent}" stroke-width="4"/><path d="M32 12 44 32 32 52 20 32Z" fill="${config.accent}" opacity=".32"/><text x="32" y="39" text-anchor="middle" font-family="ui-monospace,monospace" font-size="20" font-weight="700" fill="${config.accent}">${escapeXml(label)}</text></svg>`
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function jsonDataUrl(value: unknown) {
  return `data:application/manifest+json,${encodeURIComponent(JSON.stringify(value))}`
}

function optionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    }
    return entities[character] ?? character
  })
}
