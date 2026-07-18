import { describe, expect, it } from "vitest"

import { looksLikeDotenv, parseDotenv, toDotenv } from "./dotenv"

describe("parseDotenv", () => {
  it("parses plain KEY=value lines", () => {
    expect(parseDotenv("A=1\nB=2")).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ])
  })

  it("skips comments and blank lines", () => {
    expect(parseDotenv("# comment\n\nA=1\n  # indented\nB=2")).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ])
  })

  it("strips an `export ` prefix", () => {
    expect(parseDotenv("export TOKEN=abc")).toEqual([
      { key: "TOKEN", value: "abc" },
    ])
  })

  it("accepts `KEY: value` (YAML-ish) separators", () => {
    expect(parseDotenv("HOST: localhost")).toEqual([
      { key: "HOST", value: "localhost" },
    ])
  })

  it("unwraps double-quoted values and interprets escapes", () => {
    expect(parseDotenv('MSG="line1\\nline2"')).toEqual([
      { key: "MSG", value: "line1\nline2" },
    ])
  })

  it("keeps single-quoted values raw", () => {
    expect(parseDotenv("RAW='a\\nb'")).toEqual([{ key: "RAW", value: "a\\nb" }])
  })

  it("strips an inline comment but not a `#` inside a value", () => {
    expect(parseDotenv("A=1 # trailing")).toEqual([{ key: "A", value: "1" }])
    expect(parseDotenv("PW=pa#ss")).toEqual([{ key: "PW", value: "pa#ss" }])
  })

  it("lets a later duplicate key win (dotenv precedence)", () => {
    expect(parseDotenv("A=1\nA=2")).toEqual([{ key: "A", value: "2" }])
  })

  it("skips unparseable lines", () => {
    expect(parseDotenv("not a pair\nA=1\n=oops")).toEqual([
      { key: "A", value: "1" },
    ])
  })
})

describe("looksLikeDotenv", () => {
  it("is true for env-shaped text", () => {
    expect(looksLikeDotenv("A=1\nB=2")).toBe(true)
    expect(looksLikeDotenv("export TOKEN=abc")).toBe(true)
  })

  it("is false for prose or empty text", () => {
    expect(looksLikeDotenv("just some words here")).toBe(false)
    expect(looksLikeDotenv("")).toBe(false)
    expect(looksLikeDotenv("# only a comment")).toBe(false)
  })
})

describe("toDotenv", () => {
  it("serializes plain pairs unquoted", () => {
    expect(toDotenv([{ key: "A", value: "1" }])).toBe("A=1")
  })

  it("quotes values that need it", () => {
    expect(toDotenv([{ key: "MSG", value: "hello world" }])).toBe(
      'MSG="hello world"',
    )
    expect(toDotenv([{ key: "M", value: "a\nb" }])).toBe('M="a\\nb"')
  })

  it("round-trips through parse", () => {
    const entries = [
      { key: "A", value: "plain" },
      { key: "B", value: "has spaces" },
      { key: "C", value: 'has"quote' },
    ]
    expect(parseDotenv(toDotenv(entries))).toEqual(entries)
  })
})
