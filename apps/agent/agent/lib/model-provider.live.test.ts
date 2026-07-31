import { describe, expect, it } from "vitest"
import { generateText, type LanguageModel } from "ai"

import { resolveSigilAgentModel } from "./model-provider"

// Live smoke against a local OpenAI-compatible endpoint (Ollama, LM Studio,
// vLLM, llama.cpp). Skipped unless both env vars are set:
//   SIGIL_LOCAL_MODEL_BASE_URL  e.g. http://127.0.0.1:11434/v1
//   SIGIL_LOCAL_MODEL_ID        a model id served by that endpoint
const baseUrl = process.env.SIGIL_LOCAL_MODEL_BASE_URL
const modelId = process.env.SIGIL_LOCAL_MODEL_ID

describe.skipIf(!baseUrl || !modelId)(
  "local OpenAI-compatible endpoint (live)",
  () => {
    it("resolves the fixture shape and completes a real generation", async () => {
      const resolved = resolveSigilAgentModel({
        provider: "openai-compatible",
        model: modelId!,
        baseUrl: baseUrl!,
        contextWindowTokens: 32_768,
      })

      expect(resolved.display.provider).toBe("openai-compatible")
      expect(resolved.display.id).toBe(modelId)

      const result = await generateText({
        model: resolved.model as LanguageModel,
        prompt: 'Reply with exactly one word: "pong".',
      })

      expect(result.text.toLowerCase()).toContain("pong")
    }, 180_000)
  },
)
