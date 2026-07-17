// Pure parse/serialize/convert logic for a multi-format (JSON/JSON5/YAML)
// data editor. Not ported — the source's json-viewer.tsx declares an
// `enableJson5` prop that's never referenced anywhere in that file (no
// JSON5 parse/serialize path was ever built), and has no YAML support at
// all. Built from scratch on the real `json5` and `yaml` packages.

import JSON5 from "json5"
import * as YAML from "yaml"

export type DataFormat = "json" | "json5" | "yaml"

export const DATA_FORMAT_OPTIONS: { value: DataFormat; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "json5", label: "JSON5" },
  { value: "yaml", label: "YAML" },
]

export interface ParseResult {
  value: unknown
  error: string | null
}

export function parseData(text: string, format: DataFormat): ParseResult {
  try {
    switch (format) {
      case "json":
        return { value: JSON.parse(text), error: null }
      case "json5":
        return { value: JSON5.parse(text), error: null }
      case "yaml":
        return { value: YAML.parse(text), error: null }
    }
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function serializeData(value: unknown, format: DataFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(value, null, 2)
    case "json5":
      return JSON5.stringify(value, null, 2)
    case "yaml":
      return YAML.stringify(value)
  }
}

export interface ConvertResult {
  text: string
  error: string | null
}

/**
 * Converts source text from one format to another by parsing it in `from`
 * and re-serializing the resulting value in `to` — a real data-preserving
 * conversion, not a text rewrite. If `text` doesn't parse in `from`, returns
 * the original text unchanged along with the parse error, so a caller can
 * choose not to discard whatever the user was mid-typing.
 */
export function convertFormat(text: string, from: DataFormat, to: DataFormat): ConvertResult {
  if (from === to) return { text, error: null }
  const parsed = parseData(text, from)
  if (parsed.error) return { text, error: parsed.error }
  return { text: serializeData(parsed.value, to), error: null }
}
