import { afterEach, describe, expect, it, vi } from "vitest";

import { editImageThroughGateway } from "../src/gateway-image-edit.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("editImageThroughGateway download boundary", () => {
  it("uses only the canonical gateway settings", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        data: [{ b64_json: Buffer.from(pngBytes()).toString("base64") }],
      }),
    ) as typeof fetch;

    await editImageThroughGateway(
      request({
        SIGIL_IMAGE_EDIT_GATEWAY_KEY: "canonical-key",
        SIGIL_IMAGE_EDIT_GATEWAY_URL: "https://gateway.example",
      }),
    );

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(url).toEqual(new URL("https://gateway.example/v1/images/edits"));
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer canonical-key",
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      preset: "flux2klein4b",
      quality: "fast",
    });
  });

  it("does not honor removed gateway aliases", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        data: [{ b64_json: Buffer.from(pngBytes()).toString("base64") }],
      }),
    ) as typeof fetch;

    await editImageThroughGateway(
      request({
        GATEWAY_API_KEY: "legacy-key",
        GONK_GATEWAY_API_KEY: "legacy-key",
        GONK_GATEWAY_IMAGE_EDIT_PRESET: "legacy-preset",
        GONK_GATEWAY_URL: "https://legacy.example",
      }),
    );

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(url).toEqual(new URL("http://localhost:4000/v1/images/edits"));
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      preset: "flux2klein4b",
      quality: "fast",
    });
  });

  it("refuses redirects for the authenticated edit request", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: "http://169.254.169.254/latest/meta-data" },
          status: 307,
        }),
    ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "rejected the request (HTTP 307)",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL("http://localhost:4000/v1/images/edits"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects a cross-origin backend URL by default", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        data: [{ url: "http://169.254.169.254/latest/meta-data" }],
      }),
    ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "untrusted download location",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects that leave the allowed origin", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "/image.png" }] }))
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { location: "http://169.254.169.254/latest/meta-data" },
          status: 302,
        }),
      ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "untrusted download location",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("allows an explicitly configured download origin", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ url: "https://assets.example/edit.png" }] }),
      )
      .mockResolvedValueOnce(
        new Response(pngBytes(), {
          headers: { "content-type": "image/png" },
        }),
      ) as typeof fetch;

    const result = await editImageThroughGateway(
      request({
        SIGIL_IMAGE_EDIT_DOWNLOAD_ORIGINS: "https://assets.example",
        SIGIL_IMAGE_EDIT_GATEWAY_URL: "http://localhost:4000",
      }),
    );

    expect(result.bytes).toEqual(pngBytes());
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects non-HTTP and credential-bearing locations", async () => {
    for (const url of [
      "file:///etc/passwd",
      "http://user:password@localhost:4000/image.png",
    ]) {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({ data: [{ url }] }),
      ) as typeof fetch;

      await expect(editImageThroughGateway(request())).rejects.toThrow(
        "untrusted download location",
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects an oversized declared download before reading it", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "/image.png" }] }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": String(17 * 1024 * 1024),
            "content-type": "image/png",
          },
        }),
      ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "exceeded the 16 MiB limit",
    );
  });

  it("rejects a MIME label that does not match the returned bytes", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "/image.png" }] }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          headers: { "content-type": "image/png" },
        }),
      ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "unsupported image type",
    );
  });

  it("rejects an oversized chunked download while streaming", async () => {
    let remaining = 16 * 1024 * 1024 + 1;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (remaining === 0) {
          controller.close();
          return;
        }
        const size = Math.min(64 * 1024, remaining);
        remaining -= size;
        controller.enqueue(new Uint8Array(size));
      },
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "/image.png" }] }))
      .mockResolvedValueOnce(
        new Response(stream, { headers: { "content-type": "image/png" } }),
      ) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "exceeded the 16 MiB limit",
    );
  });

  it("does not return backend URLs or response bodies in client errors", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("internal host secret detail", { status: 500 }),
    ) as typeof fetch;

    const error = await editImageThroughGateway(request()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Image edit backend rejected the request (HTTP 500). No text-to-image fallback was attempted.",
    );
    expect((error as Error).message).not.toContain("localhost");
    expect((error as Error).message).not.toContain("secret detail");
  });

  it("does not expose transport failures", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.8:4000");
    }) as typeof fetch;

    await expect(editImageThroughGateway(request())).rejects.toThrow(
      "Image edit backend is unavailable. No text-to-image fallback was attempted.",
    );
  });
});

function request(env?: Readonly<Record<string, string | undefined>>) {
  return {
    sourceBytes: new Uint8Array([1, 2, 3]),
    sourceMediaType: "image/png",
    instruction: "Make it warmer",
    width: 512,
    height: 512,
    signal: new AbortController().signal,
    env: env ?? { SIGIL_IMAGE_EDIT_GATEWAY_URL: "http://localhost:4000" },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
