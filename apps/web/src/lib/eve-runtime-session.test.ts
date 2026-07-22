import { afterEach, describe, expect, it, vi } from "vitest"

import type { EveMessageData } from "eve/client"

import {
  createEveRuntimeSession,
  mapEvePart,
  resolveEveTurnResult,
  toEveSendMessage,
} from "./eve-runtime-session"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Eve runtime session compatibility", () => {
  it("preserves the explicit terminal result contract", () => {
    expect(resolveEveTurnResult(null, true)).toEqual({ status: "cancelled" })
    expect(
      resolveEveTurnResult(
        { status: "error", error: new Error("turn failed") },
        false,
      ),
    ).toEqual({
      status: "failed",
      error: { message: "turn failed" },
    })
    expect(
      resolveEveTurnResult({ status: "ready", error: undefined }, false),
    ).toEqual({ status: "succeeded" })
  })

  it("maps Eve tool metadata without leaking step markers into the UI", () => {
    expect(mapEvePart({ type: "step-start" })).toBeUndefined()
    expect(
      mapEvePart({
        type: "dynamic-tool",
        toolCallId: "call-1",
        toolName: "server__sigil-review",
        state: "approval-requested",
        input: { id: "draft" },
        approval: { id: "approval-1" },
        toolMetadata: {
          eve: {
            kind: "tool-call",
            name: "sigil-review",
            inputRequest: {
              requestId: "request-1",
              prompt: "Approve?",
              options: [{ id: "yes", label: "Allow", style: "primary" }],
            },
          },
        },
      }),
    ).toMatchObject({
      type: "tool-call",
      id: "call-1",
      name: "sigil-review",
      state: "approval-requested",
      inputRequest: { requestId: "request-1", prompt: "Approve?" },
    })
  })

  it("inlines browser attachments before sending them to Eve", async () => {
    const message = await toEveSendMessage("Inspect this", [
      {
        url: "data:image/png;base64,AA==",
        mediaType: "image/png",
        filename: "proof.png",
      },
    ])

    expect(message).toEqual([
      { type: "text", text: "Inspect this" },
      {
        type: "file",
        data: "data:image/png;base64,AA==",
        mediaType: "image/png",
        filename: "proof.png",
      },
    ])
  })

  it("decodes fetched text attachments into model-readable text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("first line\nsecond line")),
    )

    await expect(
      toEveSendMessage("", [
        {
          url: "https://example.test/notes.md",
          mediaType: "application/octet-stream",
        },
      ]),
    ).resolves.toEqual([
      {
        type: "text",
        text: "Attached file: notes.md\n\n```\nfirst line\nsecond line\n```",
      },
    ])
  })

  it("uses Eve's native data-url helper for fetched binary attachments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(Uint8Array.from([0, 1, 2]))),
    )

    await expect(
      toEveSendMessage("Inspect", [
        {
          url: "https://example.test/blob.bin",
          mediaType: "application/octet-stream",
          filename: "blob.bin",
        },
      ]),
    ).resolves.toEqual([
      { type: "text", text: "Inspect" },
      {
        type: "file",
        data: "data:application/octet-stream;base64,AAEC",
        mediaType: "application/octet-stream",
        filename: "blob.bin",
      },
    ])
  })

  it("keeps a visible placeholder when a browser attachment cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      toEveSendMessage("", [
        {
          url: "https://example.test/missing.pdf",
          mediaType: "application/pdf",
          filename: "missing.pdf",
        },
      ]),
    ).resolves.toEqual([
      {
        type: "text",
        text: "[Attachment missing.pdf could not be read.]",
      },
    ])
  })

  it("adapts native Eve sends without changing the product session shape", async () => {
    const execute = vi.fn().mockResolvedValue({
      finished: { status: "ready", error: undefined },
      cancelled: false,
    })
    const data: EveMessageData = { messages: [] }
    const session = createEveRuntimeSession({
      data,
      error: undefined,
      status: "ready",
      execute,
      reset: vi.fn(),
      stop: vi.fn(),
    })

    await expect(session.send({ message: "Hello" })).resolves.toEqual({
      status: "succeeded",
    })
    expect(execute).toHaveBeenCalledWith({
      clientContext: undefined,
      headers: undefined,
      message: "Hello",
    })
    expect(session.status).toBe("idle")
  })

  it("returns an explicit failed result when Eve rejects a send", async () => {
    const session = createEveRuntimeSession({
      data: { messages: [] },
      error: undefined,
      status: "ready",
      execute: vi.fn().mockRejectedValue(new Error("transport closed")),
      reset: vi.fn(),
      stop: vi.fn(),
    })

    await expect(session.send({ message: "Hello" })).resolves.toEqual({
      status: "failed",
      error: { message: "transport closed" },
    })
  })
})
