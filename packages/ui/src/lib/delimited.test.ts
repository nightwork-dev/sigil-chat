import { describe, expect, it } from "vitest"

import {
  detectDelimiter,
  parseCsv,
  parseDelimited,
  parseDelimitedRecords,
  parseTsv,
  toCsv,
  toDelimited,
  toTsv,
} from "./delimited"

describe("parseDelimited", () => {
  it("parses a simple tab-separated grid", () => {
    expect(parseTsv("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ])
  })

  it("handles CRLF row separators (Windows / Excel clipboard)", () => {
    expect(parseTsv("a\tb\r\n1\t2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("collapses a trailing newline (one row, not one plus an empty)", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]])
  })

  it("preserves a genuine blank line as an empty row", () => {
    expect(parseTsv("a\n\nb")).toEqual([["a"], [""], ["b"]])
  })

  it("parses quoted fields containing the delimiter", () => {
    expect(parseCsv('name,note\n"Doe, John",hi')).toEqual([
      ["name", "note"],
      ["Doe, John", "hi"],
    ])
  })

  it("parses quoted fields containing embedded newlines", () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([
      ["a", "line1\nline2", "c"],
    ])
  })

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('"she said ""hi"""')).toEqual([['she said "hi"']])
  })

  it("preserves empty cells", () => {
    expect(parseTsv("a\t\tc")).toEqual([["a", "", "c"]])
  })
})

describe("toDelimited", () => {
  it("serializes a grid to TSV", () => {
    expect(
      toTsv([
        ["a", "b"],
        [1, 2],
      ]),
    ).toBe("a\tb\n1\t2")
  })

  it("quotes fields that contain the delimiter", () => {
    expect(toCsv([["Doe, John", "hi"]])).toBe('"Doe, John",hi')
  })

  it("quotes and doubles embedded quotes", () => {
    expect(toCsv([['she said "hi"']])).toBe('"she said ""hi"""')
  })

  it("quotes fields with newlines", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"')
  })

  it("renders null/undefined as empty cells", () => {
    expect(toTsv([[null, undefined, "x"]])).toBe("\t\tx")
  })
})

describe("round-trip", () => {
  it("survives parse → serialize → parse for gnarly content", () => {
    const original = [
      ["header a", "header, b", 'quote"d'],
      ["multi\nline", "", "plain"],
    ]
    const serialized = toCsv(original)
    expect(parseCsv(serialized)).toEqual([
      ["header a", "header, b", 'quote"d'],
      ["multi\nline", "", "plain"],
    ])
  })
})

describe("detectDelimiter", () => {
  it("detects tabs (spreadsheet paste)", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t")
  })

  it("detects commas when they dominate", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",")
  })

  it("ignores delimiters inside quotes", () => {
    // One real comma separator; the others are inside a quoted field.
    expect(detectDelimiter('"a,b,c",d')).toBe(",")
    // Tabs present outside quotes beat a comma trapped in quotes.
    expect(detectDelimiter('"x,y"\tz')).toBe("\t")
  })
})

describe("parseDelimitedRecords", () => {
  it("keys body rows by the header row", () => {
    expect(parseTsvRecordsSample()).toEqual([
      { name: "Ada", role: "eng" },
      { name: "Grace", role: "eng" },
    ])
  })

  it("fills missing trailing cells with empty strings", () => {
    expect(parseDelimitedRecords("a\tb\n1", { delimiter: "\t" })).toEqual([
      { a: "1", b: "" },
    ])
  })

  it("returns an empty array for empty input", () => {
    expect(parseDelimitedRecords("")).toEqual([])
  })
})

function parseTsvRecordsSample() {
  return parseDelimitedRecords("name\trole\nAda\teng\nGrace\teng", {
    delimiter: "\t",
  })
}
