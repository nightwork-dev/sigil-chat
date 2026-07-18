import { describe, expect, it } from "vitest"

import {
  extensionFromUrl,
  filenameFromUrl,
  imageMediaTypeFromUrl,
  isImageUrl,
} from "./image-url"

describe("extensionFromUrl", () => {
  it("returns the lowercased extension", () => {
    expect(extensionFromUrl("https://x.com/a/pic.PNG")).toBe("png")
  })
  it("returns undefined when there is no extension", () => {
    expect(extensionFromUrl("https://x.com/a/pic")).toBeUndefined()
  })
  it("ignores query strings", () => {
    expect(extensionFromUrl("https://x.com/pic.jpg?v=2")).toBe("jpg")
  })
})

describe("isImageUrl", () => {
  it("accepts http(s) image links", () => {
    expect(isImageUrl("https://x.com/pic.png")).toBe(true)
    expect(isImageUrl("http://x.com/a/b/photo.jpeg")).toBe(true)
  })
  it("rejects non-image URLs and non-URLs", () => {
    expect(isImageUrl("https://x.com/page")).toBe(false)
    expect(isImageUrl("just text")).toBe(false)
    expect(isImageUrl("ftp://x.com/pic.png")).toBe(false)
    expect(isImageUrl("https://x.com/a b.png with trailing")).toBe(false)
  })
})

describe("imageMediaTypeFromUrl", () => {
  it("maps known extensions", () => {
    expect(imageMediaTypeFromUrl("https://x.com/a.jpg")).toBe("image/jpeg")
    expect(imageMediaTypeFromUrl("https://x.com/a.svg")).toBe("image/svg+xml")
  })
  it("falls back to image/* for unknown or missing", () => {
    expect(imageMediaTypeFromUrl("https://x.com/a.heic")).toBe("image/*")
    expect(imageMediaTypeFromUrl("https://x.com/a")).toBe("image/*")
  })
})

describe("filenameFromUrl", () => {
  it("returns the last path segment, decoded", () => {
    expect(filenameFromUrl("https://x.com/a/my%20pic.png")).toBe("my pic.png")
  })
  it("uses the fallback when there is no segment", () => {
    expect(filenameFromUrl("https://x.com/")).toBe("attachment")
    expect(filenameFromUrl("not a url", "pasted")).toBe("pasted")
  })
})
