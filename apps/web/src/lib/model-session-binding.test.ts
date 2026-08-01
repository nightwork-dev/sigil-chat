import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  issueAgentSessionBinding,
  readAgentSessionBinding,
} from "@workspace/agent-contracts/session-binding.server"

import { parseCreateAgentThreadRequest } from "./agent-threads"

const SECRET = "worktree-binding-secret"
const NOW = 1_800_000_000

const BASE = {
  applicationThreadId: "thread-1",
  personaId: "eve",
  homeScopeId: "workspace:one",
  initialPerspective: { focusScopeId: "workspace:one", viaScopeIds: [] },
  additionalContextScopeIds: [],
  subject: "user-1",
  expiresAt: NOW + 60,
}

const LUNA = {
  presetId: "codex/luna",
  provider: "codex",
  modelId: "gpt-5.6-luna",
} as const

describe("create request validation", () => {
  it("accepts a preset id and normalizes it", () => {
    expect(
      parseCreateAgentThreadRequest({
        personaId: "eve",
        modelPresetId: "  codex/luna  ",
      }),
    ).toMatchObject({ personaId: "eve", modelPresetId: "codex/luna" })
  })

  it("accepts a request that names no model at all", () => {
    expect(
      parseCreateAgentThreadRequest({ personaId: "eve" }).modelPresetId,
    ).toBeUndefined()
  })

  // The browser may name an ID and nothing else. Supplying an endpoint,
  // provider, or credential reference is refused rather than ignored, so an
  // attempt to reach a model the server did not authorize fails loudly.
  it("refuses a body that supplies an endpoint, provider, or credential", () => {
    for (const extra of [
      { baseUrl: "http://127.0.0.1:1234/v1" },
      { provider: "openai-compatible" },
      { apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY" },
      { model: { presetId: "luna", provider: "codex", modelId: "x" } },
      { executionBinding: { principalId: "someone-else" } },
    ]) {
      expect(
        () => parseCreateAgentThreadRequest({ personaId: "eve", ...extra }),
        JSON.stringify(extra),
      ).toThrow(/Unsupported thread creation fields/)
    }
  })

  it("refuses a malformed preset id before it reaches the resolver", () => {
    for (const modelPresetId of [
      "",
      "Codex/Luna",
      "../../etc",
      "codex/luna/extra",
      "codex/",
      "/luna",
      "codex luna",
      7,
      { id: "luna" },
      "a".repeat(130),
    ]) {
      expect(
        () =>
          parseCreateAgentThreadRequest({ personaId: "eve", modelPresetId }),
        JSON.stringify(modelPresetId),
      ).toThrow(/malformed/)
    }
  })

  it("refuses a request that is not an object carrying a persona", () => {
    expect(() => parseCreateAgentThreadRequest(null)).toThrow()
    expect(() =>
      parseCreateAgentThreadRequest([{ personaId: "eve" }]),
    ).toThrow()
    expect(() => parseCreateAgentThreadRequest({})).toThrow(/persona id/)
  })
})

describe("signed binding round trip", () => {
  // Load-bearing: @zigil/agent's own readAgentSessionExecutionBinding
  // reconstructs a fixed key whitelist and would DROP this field. Verification
  // goes through the LOCAL reader, which returns the verified payload
  // verbatim. If that ever changes, this test is what catches it.
  it("carries the bound model through issue and verify", () => {
    const proof = issueAgentSessionBinding({ ...BASE, model: LUNA }, SECRET)
    const verified = readAgentSessionBinding(proof, NOW, SECRET)

    expect(verified?.model).toEqual(LUNA)
  })

  it("still verifies a binding that names no model", () => {
    const verified = readAgentSessionBinding(
      issueAgentSessionBinding(BASE, SECRET),
      NOW,
      SECRET,
    )

    expect(verified).toBeDefined()
    expect(verified?.model).toBeUndefined()
  })

  it("refuses a proof whose model was tampered into a malformed shape", () => {
    const proof = issueAgentSessionBinding({ ...BASE, model: LUNA }, SECRET)
    const [encoded] = proof.split(".")
    const payload = JSON.parse(
      Buffer.from(encoded!, "base64url").toString("utf8"),
    )
    payload.model = { presetId: "luna" }
    const forged = Buffer.from(JSON.stringify(payload)).toString("base64url")

    // Re-signing with the real secret proves the REJECTION comes from payload
    // validation, not merely from a broken signature.
    const signature = createHmac("sha256", SECRET)
      .update(forged)
      .digest("base64url")

    expect(
      readAgentSessionBinding(`${forged}.${signature}`, NOW, SECRET),
    ).toBeUndefined()
  })

  it("refuses a model swapped in without the secret", () => {
    const proof = issueAgentSessionBinding({ ...BASE, model: LUNA }, SECRET)
    const [encoded, signature] = proof.split(".")
    const payload = JSON.parse(
      Buffer.from(encoded!, "base64url").toString("utf8"),
    )
    payload.model = {
      presetId: "expensive",
      provider: "anthropic",
      modelId: "opus",
    }
    const swapped = Buffer.from(JSON.stringify(payload)).toString("base64url")

    expect(
      readAgentSessionBinding(`${swapped}.${signature}`, NOW, SECRET),
    ).toBeUndefined()
  })
})
