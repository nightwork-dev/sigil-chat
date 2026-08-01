#!/usr/bin/env node

import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

import {
  createEveFabricHostFromEnvironment,
  fabricCapabilityCoordinate,
} from "@gonk/eve-host/fabric"
import {
  IMAGE_GENERATE_CAPABILITY,
  createImageGenerateCapability,
} from "@gonk/image-gen"
import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import {
  ToolRegistry,
  makeBaseContext,
} from "@gonk/tool-registry"
import { sigilApprovalProvider } from "@workspace/agent-tools/approval"

const runSuffix = process.env.GONK_FABRIC_SMOKE_RUN_ID?.trim() || `${Date.now()}`
const stateRoot = resolve(
  process.env.SIGIL_DATA_DIR ??
    process.env.GONK_FABRIC_STATE_DIR ??
    ".data/fabric-smoke",
)
const storeRoot = resolve(stateRoot, "host-store")
mkdirSync(storeRoot, { recursive: true })
const scope = createScope({
  cwd: storeRoot,
  projectRoot: storeRoot,
  sessionId: `sigil-chat-fabric-smoke-${runSuffix}`,
})
const store = createStoreProvider(scope, {
  backendFactory: mirkBackendFactory(scope),
})
const host = await createEveFabricHostFromEnvironment({
  scopeOrStore: store,
})
if (!host) throw new Error("GONK_FABRIC_RELAY_URL is required")

const now = Date.now()
const expiresAt = now + 5 * 60_000
const provider =
  process.env.GONK_FABRIC_IMAGE_PROVIDER?.trim() || "comfyui"
const modelId =
  process.env.GONK_FABRIC_IMAGE_MODEL_ID?.trim() || "local/chroma"
const restrictionPolicyRefs = (
  process.env.GONK_FABRIC_RESTRICTION_POLICY_REFS || "private-local"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
const runId = `sigil-chat:fabric-smoke:${runSuffix}`
const runExecutionId = `${runId}:execution`
const observedTurnId = `${runId}:turn`
const definition = createImageGenerateCapability(async () => {
  throw new Error("The local image implementation must not run in this smoke")
})
const bound = host.bind(
  definition,
  fabricCapabilityCoordinate(IMAGE_GENERATE_CAPABILITY),
  () => ({
    installationId: host.installationId,
    principalId: "sigil-chat:fabric-smoke",
    audienceWorkerId: host.workerId,
    authorizationReceiptRef: `${runId}:authorization`,
    executionPolicy: {
      policyRef: "sigil-chat:fabric-smoke:v1",
      restrictionPolicyRefs,
      retrySafety: "safe",
      continuity: { mode: "stateless" },
      model: {
        provider,
        modelId,
        allowedFallbacks: [],
      },
    },
    executionContext: {
      runId,
      runExecutionId,
      traceId: `${runId}:trace`,
      parentSpanId: `${runId}:tool`,
      executionBindingId: `${runId}:binding`,
      executionBindingDigest: `sha256:${"0".repeat(64)}`,
      runtimeSessionBindingId: `${runId}:runtime`,
    },
    observedTurnId,
    scopeContextDigest: `sha256:${"1".repeat(64)}`,
    artifactAccess: [
      {
        accessRef: `${runId}:artifact:image`,
        outputSlot: "image",
        operation: "write",
        maxBytes: 25 * 1024 * 1024,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    ],
    limits: {
      notBefore: new Date(now - 5_000).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      maxRuntimeMs: 4 * 60_000,
      maxProgressEvents: 240,
      maxOutputEvents: 8,
      maxInlineOutputBytes: 64 * 1024,
      maxArtifactBytes: 25 * 1024 * 1024,
    },
  }),
)
const registry = new ToolRegistry({
  security: { approvalProvider: sigilApprovalProvider },
})
registry.register(bound)

try {
  const events = []
  for await (const event of registry.invoke(
    IMAGE_GENERATE_CAPABILITY.capabilityId,
    {
      prompt: "A one-pixel topology proof for the encrypted compute path",
      filenamePrefix: `fabric-proof-${runSuffix}`,
    },
    makeBaseContext({
      auth: {
        principal: {
          id: "sigil-chat:fabric-smoke",
          kind: "service",
          identity: {
            issuer: "sigil-chat",
            subject: "fabric-smoke",
            method: "local",
          },
          roles: ["operator"],
          scopes: ["sigil-chat:fabric-smoke"],
        },
        authorize: () => ({
          outcome: "allow",
          policyId: "sigil-chat:fabric-smoke:v1",
          reason: "Explicit local topology proof",
        }),
      },
    }),
  )) {
    events.push(event)
  }
  const result = events.findLast((event) => event.type === "result")
  const runLink = host.executions.readRunExecutionLink(runExecutionId)
  const job = runLink ? host.jobs.read(runLink.jobId) : undefined
  const artifacts = result?.data?.artifacts
  if (
    !result ||
    !job ||
    job.status !== "done" ||
    !Array.isArray(artifacts) ||
    artifacts.length !== 1
  ) {
    throw new Error(
      `Fabric image smoke did not commit one artifact-producing job: ${JSON.stringify({
        events,
        resultOk: Boolean(result),
        runLink,
        job,
        artifactCount: Array.isArray(artifacts) ? artifacts.length : null,
      })}`,
    )
  }
  const receipts = host.executions.listReceipts(job.jobId)
  if (receipts.length !== 1) {
    throw new Error("Fabric image smoke did not persist exactly one receipt")
  }
  process.stdout.write(
    `${JSON.stringify({
      event: "sigil_chat_fabric_image_smoke_passed",
      runId,
      runExecutionId,
      jobId: job.jobId,
      status: job.status,
      progressEvents: events.filter((event) => event.type === "progress").length,
      artifact: artifacts[0],
      usage: result.data.usage,
      receiptCount: receipts.length,
    })}\n`,
  )
} finally {
  await host.close()
}
