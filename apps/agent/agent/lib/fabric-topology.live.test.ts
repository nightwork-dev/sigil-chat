import { afterAll, describe, expect, it } from "vitest"

import {
  collectToolOutcome,
  makeBaseContext,
} from "@gonk/tool-registry"
import type { ImageGenerateOutput } from "@gonk/image-gen"

const fabricConfigured = Boolean(process.env.GONK_FABRIC_RELAY_URL?.trim())
let closeFabricHost: (() => Promise<void>) | undefined

describe.skipIf(!fabricConfigured)("Sigil Chat Fabric topology", () => {
  afterAll(async () => {
    await closeFabricHost?.()
  })

  it("dispatches the canonical image action and commits its receipt", async () => {
    const [{ agentToolRegistry, eveFabricHost }, { createFabricToolHostContext }] =
      await Promise.all([
        import("./application-services"),
        import("./gonk-tool-context"),
      ])
    expect(eveFabricHost).toBeDefined()
    closeFabricHost = eveFabricHost?.close

    const proofId = `${Date.now()}-${process.pid}`
    const principalId = "fabric-smoke-owner"
    const threadId = `fabric-smoke-thread-${proofId}`
    const sessionId = `fabric-smoke-session-${proofId}`
    const turnId = `fabric-smoke-turn-${proofId}`
    const resourceScope = `session:${threadId}`
    const fabric = createFabricToolHostContext({
      binding: {
        subject: principalId,
        applicationThreadId: threadId,
        personaId: "eve",
        homeScopeId: `personal:${principalId}`,
        initialPerspective: {
          focusScopeId: `personal:${principalId}`,
          viaScopeIds: [],
        },
        additionalContextScopeIds: [],
      },
      callId: `fabric-smoke-call-${proofId}`,
      eveSessionId: sessionId,
      principalId,
      resourceScope,
      subject: principalId,
      turnId,
    })
    const outcome = await collectToolOutcome(
      agentToolRegistry.invoke(
        "image_generate",
        {
          prompt: "A one-pixel topology proof",
          width: 64,
          height: 64,
          filenamePrefix: "fabric-topology-proof",
        },
        makeBaseContext({
          auth: {
            principal: {
              id: principalId,
              kind: "human",
              identity: {
                issuer: "sigil-chat.fabric-smoke",
                subject: principalId,
                method: "custom:fabric-smoke",
              },
              roles: ["owner"],
              scopes: [resourceScope],
            },
            authorize: () => ({
              outcome: "allow",
              reason: "Authenticated topology smoke",
              policyId: "sigil-chat.fabric-smoke",
            }),
          },
          host: {
            resourceScope,
            applicationThreadId: threadId,
            personaId: "eve",
            fabric,
          },
        }),
      ),
    )
    if (!outcome.ok) {
      console.info(
        JSON.stringify({
          event: "sigil_chat_fabric_topology_failed",
          code: outcome.code,
          message: outcome.message,
        }),
      )
    }

    expect(outcome).toMatchObject({
      ok: true,
      data: {
        artifacts: [
          {
            mediaType: "image/png",
            digest: {
              algorithm: "sha256",
              value: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
            producer: {
              system: "llm-service.compute-worker",
              operation: "image_generate",
              jobId: expect.any(String),
              attemptId: expect.any(String),
              outputSlot: "image",
            },
          },
        ],
        usage: {
          provider: process.env.GONK_FABRIC_IMAGE_PROVIDER ?? "comfyui",
          modelId: process.env.GONK_FABRIC_IMAGE_MODEL_ID ?? "local/chroma",
        },
      },
    })
    if (!outcome.ok || !eveFabricHost) throw new Error("Fabric proof failed")
    const data = outcome.data as ImageGenerateOutput
    const artifact = data.artifacts[0]
    const jobId = artifact?.producer?.jobId
    expect(jobId).toBeTruthy()
    const job = eveFabricHost.jobs.read(jobId as string)
    const attempts = eveFabricHost.executions.listAttempts(jobId)
    const receipts = eveFabricHost.executions.listReceipts(jobId)
    const runLink = eveFabricHost.executions.readRunExecutionLink(
      fabric.executionContext.runExecutionId,
    )
    expect(job).toMatchObject({ status: "done" })
    expect(attempts).toEqual([
      expect.objectContaining({
        status: "succeeded",
        executionReceiptId: expect.any(String),
      }),
    ])
    expect(receipts).toEqual([
      expect.objectContaining({
        outcome: "succeeded",
        jobId,
        terminalDigest: expect.stringMatching(/^sha256:/),
      }),
    ])
    expect(runLink).toMatchObject({
      jobId,
      runExecutionId: fabric.executionContext.runExecutionId,
      executionBindingDigest:
        fabric.executionContext.executionBindingDigest,
      observedTurnId: turnId,
    })

    console.info(
      JSON.stringify({
        event: "sigil_chat_fabric_topology_verified",
        jobId,
        attemptId: attempts[0]?.attemptId,
        receiptId: receipts[0]?.receiptId,
        artifactId: artifact?.id,
        runExecutionId: runLink?.runExecutionId,
        provider: data.usage.provider,
        modelId: data.usage.modelId,
      }),
    )
  }, 5 * 60_000)
})
