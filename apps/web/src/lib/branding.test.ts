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
        SIGIL_APP_NAME: "Lantern",
        SIGIL_APP_TITLE: "Lantern — campaign room",
        SIGIL_APP_DESCRIPTION: "A collaborative campaign workspace.",
        SIGIL_APP_ORIGIN: "https://lantern.example/ignored/path",
        SIGIL_BRAND_COLOR: "#12ABef",
        SIGIL_INSTANCE_LABEL: "preview",
        SIGIL_SHARE_IMAGE_URL: "/share/lantern.png",
      },
      { development: false },
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

  it("allows automatic worktree branding to be explicitly disabled", () => {
    expect(
      resolveBranding(
        { SIGIL_INSTANCE_LABEL: "" },
        { development: true, worktreeName: "sigil-chat-feature" },
      ).instanceLabel,
    ).toBeUndefined()
  })

  it("rejects malformed public branding values", () => {
    expect(() =>
      resolveBranding({ SIGIL_BRAND_COLOR: "gold" }, { development: false }),
    ).toThrow("SIGIL_BRAND_COLOR")
    expect(() =>
      resolveBranding(
        { SIGIL_APP_ORIGIN: "file:///tmp/app" },
        { development: false },
      ),
    ).toThrow("SIGIL_APP_ORIGIN")
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
