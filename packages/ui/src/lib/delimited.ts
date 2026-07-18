// Delimited-text (TSV/CSV) parse + serialize, tuned for the clipboard
// round-trip with spreadsheets. Google Sheets and Excel put TAB-separated
// values on the clipboard's `text/plain` flavor, with `\n` (or `\r\n`) row
// separators and RFC-4180-style quoting: a field is wrapped in double quotes
// when it contains the delimiter, a quote, or a newline, and embedded quotes
// are doubled (`"` → `""`).
//
// This is the pure engine behind the paste-from-Sheets / copy-to-Sheets
// behaviors. It has no React and no DOM dependency so it can be unit-tested and
// reused anywhere (clipboard hooks, file parsing, import flows).

export interface DelimitedOptions {
  /** Field separator. Defaults to a tab (spreadsheet clipboard convention). */
  readonly delimiter?: string
}

/**
 * Parse delimited text into a grid of string cells, honoring RFC-4180 quoting
 * (quoted fields may contain the delimiter, quotes as `""`, and newlines).
 *
 * Returns `string[][]` — rows of raw string cells. Interpreting/coercing those
 * cells (numbers, headers, key/value) is the caller's job.
 */
export function parseDelimited(
  text: string,
  options: DelimitedOptions = {},
): string[][] {
  const delimiter = options.delimiter ?? "\t"

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ""
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === delimiter) {
      pushField()
      i += 1
      continue
    }
    if (char === "\n") {
      pushRow()
      i += 1
      continue
    }
    if (char === "\r") {
      // Swallow CR of a CRLF pair; a lone CR also ends a row.
      pushRow()
      if (text[i + 1] === "\n") i += 2
      else i += 1
      continue
    }
    field += char
    i += 1
  }

  // Flush the final field/row unless the text ended exactly on a row break (in
  // which case pushRow already ran and field/row are empty). This is also what
  // makes a trailing newline collapse cleanly — "a\tb\n" is one row, not one
  // row plus an empty one — while a genuine blank line ("a\n\nb") is preserved.
  if (field.length > 0 || row.length > 0) pushRow()

  return rows
}

/** A cell value acceptable for serialization. `null`/`undefined` become empty. */
export type DelimitedCell = string | number | boolean | null | undefined

/**
 * Serialize a grid to delimited text, quoting any field that contains the
 * delimiter, a quote, or a newline (with embedded quotes doubled). The output
 * pastes cleanly into a spreadsheet when the delimiter is a tab.
 */
export function toDelimited(
  rows: readonly (readonly DelimitedCell[])[],
  options: DelimitedOptions = {},
): string {
  const delimiter = options.delimiter ?? "\t"
  return rows
    .map((row) =>
      row.map((cell) => quoteField(cell, delimiter)).join(delimiter),
    )
    .join("\n")
}

function quoteField(cell: DelimitedCell, delimiter: string): string {
  const value = cell == null ? "" : String(cell)
  const needsQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  if (!needsQuote) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Guess whether a pasted blob is tab- or comma-separated by sampling the first
 * line. Tabs win ties because that is the spreadsheet clipboard convention and
 * commas legitimately appear inside prose cells. Returns `"\t"` when neither
 * clearly dominates.
 */
export function detectDelimiter(text: string): "\t" | "," {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const tabs = countOutsideQuotes(firstLine, "\t")
  const commas = countOutsideQuotes(firstLine, ",")
  return commas > tabs ? "," : "\t"
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === char && !inQuotes) count += 1
  }
  return count
}

/** Parse tab-separated values (the spreadsheet clipboard flavor). */
export function parseTsv(text: string): string[][] {
  return parseDelimited(text, { delimiter: "\t" })
}

/** Serialize to tab-separated values (pastes into a spreadsheet). */
export function toTsv(rows: readonly (readonly DelimitedCell[])[]): string {
  return toDelimited(rows, { delimiter: "\t" })
}

/** Parse comma-separated values. */
export function parseCsv(text: string): string[][] {
  return parseDelimited(text, { delimiter: "," })
}

/** Serialize to comma-separated values. */
export function toCsv(rows: readonly (readonly DelimitedCell[])[]): string {
  return toDelimited(rows, { delimiter: "," })
}

/**
 * Parse a delimited grid whose first row is a header, into an array of records
 * keyed by column name. Handy for "paste a Sheets selection with headers into a
 * form/table" flows. Extra cells beyond the header are ignored; missing cells
 * become empty strings.
 */
export function parseDelimitedRecords(
  text: string,
  options: DelimitedOptions = {},
): Record<string, string>[] {
  const rows = parseDelimited(text, options)
  if (rows.length === 0) return []
  const [header, ...body] = rows
  const keys = header ?? []
  return body.map((row) => {
    const record: Record<string, string> = {}
    keys.forEach((key, index) => {
      record[key] = row[index] ?? ""
    })
    return record
  })
}
