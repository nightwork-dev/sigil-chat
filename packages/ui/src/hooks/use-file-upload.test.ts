import { describe, expect, it } from "vitest"

import { matchesAccept } from "./use-file-upload"

function file(name: string, type: string): File {
  return new File(["x"], name, { type })
}

describe("matchesAccept", () => {
  it("accepts anything when the filter is empty", () => {
    expect(matchesAccept(file("a.bin", ""), undefined)).toBe(true)
    expect(matchesAccept(file("a.bin", ""), "")).toBe(true)
  })

  it("matches a wildcard media type", () => {
    expect(matchesAccept(file("p.png", "image/png"), "image/*")).toBe(true)
    expect(matchesAccept(file("d.pdf", "application/pdf"), "image/*")).toBe(
      false,
    )
  })

  it("matches a full media type", () => {
    expect(matchesAccept(file("d.pdf", "application/pdf"), "application/pdf")).toBe(
      true,
    )
  })

  it("matches an extension token regardless of reported MIME", () => {
    // Spreadsheets/CSVs often arrive with an empty or generic MIME type; the
    // extension token still lets them through.
    expect(matchesAccept(file("data.csv", ""), ".csv")).toBe(true)
    expect(matchesAccept(file("data.csv", ""), ".tsv")).toBe(false)
  })

  it("matches against any token in a comma list", () => {
    const accept = "image/*,application/pdf,.csv"
    expect(matchesAccept(file("p.png", "image/png"), accept)).toBe(true)
    expect(matchesAccept(file("d.pdf", "application/pdf"), accept)).toBe(true)
    expect(matchesAccept(file("t.csv", ""), accept)).toBe(true)
    expect(matchesAccept(file("m.mov", "video/quicktime"), accept)).toBe(false)
  })

  it("is case-insensitive for extensions and types", () => {
    expect(matchesAccept(file("PHOTO.PNG", "IMAGE/PNG"), "image/*")).toBe(true)
    expect(matchesAccept(file("DATA.CSV", ""), ".csv")).toBe(true)
  })
})
