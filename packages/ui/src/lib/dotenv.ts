// `.env`-style key/value parse + serialize. The parse side is the engine behind
// the "paste a block of KEY=value lines and auto-populate a form" behavior
// (Vercel does this for environment variables). It is intentionally lenient: it
// accepts the common shapes people actually paste — `export` prefixes, `#`
// comments, blank lines, quoted values, `KEY: value` (YAML-ish) — and skips
// what it can't make sense of rather than throwing.
//
// Pure: no React, no DOM. Unit-tested and reusable anywhere.

export interface DotenvEntry {
  readonly key: string
  readonly value: string
}

const LINE_PATTERN =
  // optional `export `, key, `=` or `:` separator, rest-of-line value.
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)\s*$/

/**
 * Parse `.env`-style text into ordered key/value entries. Later duplicate keys
 * win, matching dotenv precedence, but order follows first appearance. Comments
 * (`#`), blank lines, and unparseable lines are skipped.
 */
export function parseDotenv(text: string): DotenvEntry[] {
  const byKey = new Map<string, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const match = LINE_PATTERN.exec(line)
    if (!match) continue
    const key = match[1]
    if (key === undefined) continue
    byKey.set(key, unquoteValue(match[2] ?? ""))
  }
  return Array.from(byKey, ([key, value]) => ({ key, value }))
}

/** True when `text` looks like it contains at least one `KEY=value` pair —
 *  useful for deciding whether a pasted blob should be treated as env input. */
export function looksLikeDotenv(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith("#") && LINE_PATTERN.test(trimmed)
    })
}

/**
 * Serialize entries back to `.env` text. Values that need it (spaces, `#`,
 * quotes, `=`, or leading/trailing whitespace) are wrapped in double quotes with
 * embedded quotes and newlines escaped.
 */
export function toDotenv(entries: readonly DotenvEntry[]): string {
  return entries.map(({ key, value }) => `${key}=${quoteValue(value)}`).join("\n")
}

function unquoteValue(raw: string): string {
  const value = stripInlineComment(raw.trim())
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = value.slice(1, -1)
      // Double-quoted values interpret escape sequences; single-quoted are raw.
      return first === '"' ? unescapeDoubleQuoted(inner) : inner
    }
  }
  return value
}

// A `#` starts a comment only when unquoted and preceded by whitespace (or at
// the start) — a `#` inside a value like `pass#word` is not a comment.
function stripInlineComment(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) return value
  const hashIndex = value.search(/\s#/)
  if (hashIndex === -1) return value
  return value.slice(0, hashIndex).trim()
}

function unescapeDoubleQuoted(inner: string): string {
  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

function quoteValue(value: string): string {
  const needsQuote = /[\s#"'=]/.test(value) || value !== value.trim()
  if (!needsQuote) return value
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  return `"${escaped}"`
}
