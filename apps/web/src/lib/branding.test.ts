import { describe, expect, it } from "vitest"

import { inferWorktreeLabel, resolveBranding, siteUrl } from "./branding"

describe("application branding", () => {
  it("keeps production defaults stable", () => {
    const branding = resolveBranding({}, { development: false })

    expect(branding).toMatchObject({
      name: "Sigil Chat",
      title: "Sigil Chat — agentic conversations",
      origin: "http://sigil-chat.localhost:1355",
      accent: "#b58b35",
    })
    expect(branding.faviconHref).toMatch(/^data:image\/svg\+xml,/)
    expect(branding.manifestHref).toMatch(/^data:application\/manifest\+json,/)
  })

  it("derives a stable development identity from the worktree", () => {
    const first = resolveBranding(
      { PORTLESS_URL: "http://rebrandable.sigil-chat.localhost:1355" },
      { development: true, worktreeName: "sigil-chat-rebrandable" },
    )
    const second = resolveBranding(
      {},
      {
        development: true,
        worktreeName: "sigil-chat-rebrandable",
      },
    )

    expect(first.instanceLabel).toBe("rebrandable")
    expect(first.title).toBe("[rebrandable] Sigil Chat — agentic conversations")
    expect(first.origin).toBe("http://rebrandable.sigil-chat.localhost:1355")
    expect(first.accent).toBe(second.accent)
    expect(first.accent).not.toBe("#b58b35")
  })

  it("uses Portless' branch prefix as the visible instance identity", () => {
    const branding = resolveBranding(
      {
        PORTLESS_URL: "http://rebrandable-app.sigil-chat.localhost:1355",
      },
      { development: true, worktreeName: "sigil-chat-rebrandable" },
    )

    expect(branding.instanceLabel).toBe("rebrandable-app")
    expect(branding.title).toMatch(/^\[rebrandable-app\]/)
  })

  it("supports a complete explicit rebrand", () => {
    const branding = resolveBranding(
      {
        SIGIL_PUBLIC_URL: "https://lantern.example/ignored/path",
      },
      { development: false },
      {
        accent: "#12ABef",
        description: "A collaborative campaign workspace.",
        instanceLabel: "preview",
        name: "Lantern",
        shareImageUrl: "/share/lantern.png",
        title: "Lantern — campaign room",
      },
    )

    expect(branding).toMatchObject({
      name: "Lantern",
      title: "[preview] Lantern — campaign room",
      description: "A collaborative campaign workspace.",
      origin: "https://lantern.example",
      accent: "#12abef",
      shareImageUrl: "https://lantern.example/share/lantern.png",
    })
    expect(decodeURIComponent(branding.faviconHref)).toContain("#12abef")
  })

  it("allows checked-in config to disable automatic worktree branding", () => {
    expect(
      resolveBranding(
        {},
        { development: true, worktreeName: "sigil-chat-feature" },
        { instanceLabel: false },
      ).instanceLabel,
    ).toBeUndefined()
  })

  it("rejects malformed public branding values", () => {
    expect(() =>
      resolveBranding({}, { development: false }, { accent: "gold" }),
    ).toThrow("accent")
    expect(() =>
      resolveBranding(
        { SIGIL_PUBLIC_URL: "file:///tmp/app" },
        { development: false },
      ),
    ).toThrow("SIGIL_PUBLIC_URL")
  })

  it("builds canonical URLs without duplicating separators", () => {
    expect(siteUrl({ origin: "https://example.test" }, "/projects/one")).toBe(
      "https://example.test/projects/one",
    )
  })

  it("normalizes the conventional worktree directory name", () => {
    expect(inferWorktreeLabel("sigil-chat")).toBeUndefined()
    expect(inferWorktreeLabel("sigil-chat-chrome")).toBe("chrome")
  })
})
