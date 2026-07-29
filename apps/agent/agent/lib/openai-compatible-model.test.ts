import { describe, expect, it } from "vitest"

import { createOpenAICompatibleChatModel } from "./openai-compatible-model"

describe("OpenAI-compatible chat-completions model", () => {
  it("posts AI SDK prompts to the configured chat completions endpoint", async () => {
    const requests: Array<{ body: unknown; headers: Headers; url: string }> = []
    const model = createOpenAICompatibleChatModel({
      apiKey: "local-key",
      baseUrl: "http://127.0.0.1:11434/v1/",
      fetch: async (input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          url: String(input),
        })
        return Response.json({
          id: "chatcmpl-test",
          model: "llama3.1:8b",
          choices: [
            {
              finish_reason: "stop",
              message: { content: "Hello from local." },
            },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 4,
            total_tokens: 7,
          },
        })
      },
      model: "llama3.1:8b",
    })

    const result = await (model as any).doGenerate({
      prompt: [
        { role: "system", content: "Be brief." },
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ],
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    )
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer local-key")
    expect(requests[0]?.body).toMatchObject({
      model: "llama3.1:8b",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello" },
      ],
      stream: false,
    })
    expect(result.content).toEqual([
      { type: "text", text: "Hello from local." },
    ])
    expect(result.usage.inputTokens.total).toBe(3)
    expect(result.usage.outputTokens.total).toBe(4)
  })

  it("surfaces endpoint failures without leaking credentials", async () => {
    const model = createOpenAICompatibleChatModel({
      apiKey: "secret-local-key",
      baseUrl: "http://127.0.0.1:1234/v1",
      fetch: async () => new Response("nope", { status: 503 }),
      model: "local-model",
    })

    await expect(
      (model as any).doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      }),
    ).rejects.toThrow(/HTTP 503/)
  })
})
