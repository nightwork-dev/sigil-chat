import { describe, expect, it, vi } from "vitest"

import { handleDevelopmentLogin } from "./dev-login.server"

const request = (token = "login-token-1234") =>
  new Request(`http://dx.sigil-chat.localhost:1355/dev-login?token=${token}`)

const credentials = {
  email: "owner@sigil.local",
  password: "owner-password-1234",
}

describe("development login", () => {
  it("exchanges the private launcher token for a normal auth session", async () => {
    const consumeToken = vi.fn()
    const signIn = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          "set-cookie": "sigil.session=session-value; Path=/; HttpOnly",
        },
        status: 200,
      }),
    )

    const response = await handleDevelopmentLogin(request(), {
      baseUrl: "http://dx.sigil-chat.localhost:1355",
      consumeToken,
      credentials,
      expectedToken: "login-token-1234",
      isProduction: false,
      signIn,
    })

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/chat")
    expect(response.headers.get("set-cookie")).toContain("sigil.session=")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(signIn).toHaveBeenCalledWith(credentials)
    expect(consumeToken).toHaveBeenCalledOnce()
  })

  it.each([
    ["production", { isProduction: true }],
    ["missing token", { expectedToken: undefined }],
    ["wrong token", { expectedToken: "different-token" }],
  ])("stays unavailable for %s", async (_label, override) => {
    const signIn = vi.fn()
    const response = await handleDevelopmentLogin(request(), {
      baseUrl: "http://dx.sigil-chat.localhost:1355",
      consumeToken: vi.fn(),
      credentials,
      expectedToken: "login-token-1234",
      isProduction: false,
      signIn,
      ...override,
    })

    expect(response.status).toBe(404)
    expect(signIn).not.toHaveBeenCalled()
  })

  it("rejects a request for a different worktree origin", async () => {
    const response = await handleDevelopmentLogin(
      new Request(
        "http://other.sigil-chat.localhost:1355/dev-login?token=login-token-1234",
      ),
      {
        baseUrl: "http://dx.sigil-chat.localhost:1355",
        consumeToken: vi.fn(),
        credentials,
        expectedToken: "login-token-1234",
        isProduction: false,
        signIn: vi.fn(),
      },
    )

    expect(response.status).toBe(404)
  })

  it("does not consume the token when Better Auth rejects the owner", async () => {
    const consumeToken = vi.fn()
    const response = await handleDevelopmentLogin(request(), {
      baseUrl: "http://dx.sigil-chat.localhost:1355",
      consumeToken,
      credentials,
      expectedToken: "login-token-1234",
      isProduction: false,
      signIn: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    })

    expect(response.status).toBe(503)
    expect(consumeToken).not.toHaveBeenCalled()
  })
})
