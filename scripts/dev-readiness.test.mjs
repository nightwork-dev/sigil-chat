import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkDevelopmentReadiness,
  DevelopmentReadinessError,
  waitForDevelopmentReadiness,
} from "./dev-readiness.mjs";

const topology = {
  eveOrigin: "http://dx.sigil-chat-agent.localhost:1355",
  gonkOrigin: "http://dx.sigil-chat-gonk.localhost:1355",
  webOrigin: "http://dx.sigil-chat.localhost:1355",
};

describe("development readiness", () => {
  it("proves the authenticated web to Eve to Gonk path", async () => {
    const calls = [];
    const result = await checkDevelopmentReadiness({
      credentials: {
        email: "owner@sigil.local",
        password: "owner-password-1234",
      },
      fetcher: async (input, init) => {
        const url = String(input);
        calls.push({ headers: new Headers(init?.headers), url });
        if (url.endsWith("/healthz")) return Response.json({ status: "ok" });
        if (url.endsWith("/api/auth/sign-in/email")) {
          return new Response(null, {
            headers: {
              "set-cookie": "sigil.session=session-value; Path=/; HttpOnly",
            },
          });
        }
        if (url.endsWith("/api/auth/token")) {
          return Response.json({ token: "eve-token" });
        }
        if (url.endsWith("/sigil/v1/readiness")) {
          return Response.json({ status: "ready" });
        }
        if (url.endsWith("/eve/v1/info")) {
          return Response.json({
            connections: [
              {
                connectionName: "gonk",
                protocol: "mcp",
                url: "http://dx.sigil-chat-gonk.localhost:1355/mcp",
              },
            ],
          });
        }
        if (url.endsWith("/health")) return Response.json({ status: "ok" });
        return new Response(null, { status: 404 });
      },
      gonkApiKey: "gonk-service-key",
      topology,
    });

    assert.deepEqual(result, { status: "ready" });
    assert.equal(calls.length, 6);
    assert.equal(calls[2].headers.get("cookie"), "sigil.session=session-value");
    assert.equal(calls[3].headers.get("authorization"), "Bearer eve-token");
    assert.equal(
      calls[5].headers.get("authorization"),
      "Bearer gonk-service-key",
    );
  });

  it("classifies the boundary that is not ready", async () => {
    await assert.rejects(
      checkDevelopmentReadiness({
        credentials: {
          email: "owner@sigil.local",
          password: "owner-password-1234",
        },
        fetcher: async () => new Response(null, { status: 503 }),
        gonkApiKey: "gonk-service-key",
        topology,
      }),
      (error) =>
        error instanceof DevelopmentReadinessError &&
        error.code === "WEB_UNHEALTHY",
    );
  });

  it("fails immediately when the seeded owner credentials are rejected", async () => {
    let delayCount = 0;

    await assert.rejects(
      waitForDevelopmentReadiness(
        {
          credentials: {
            email: "owner@sigil.local",
            password: "owner-password-1234",
          },
          fetcher: async (input) =>
            String(input).endsWith("/healthz")
              ? Response.json({ status: "ok" })
              : new Response(null, { status: 401 }),
          gonkApiKey: "gonk-service-key",
          topology,
        },
        {
          delay: async () => {
            delayCount += 1;
          },
          intervalMs: 1,
          timeoutMs: 100,
        },
      ),
      (error) =>
        error instanceof DevelopmentReadinessError &&
        error.code === "OWNER_SIGN_IN_FAILED" &&
        error.retryable === false,
    );

    assert.equal(delayCount, 0);
  });
});
