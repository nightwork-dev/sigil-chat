import {
  fabricExecutionBindingDigest,
  type EveFabricHost,
  type EveFabricToolHostContext,
  type FabricDispatchMetadataV1,
} from "@gonk/eve-host/fabric"
import type { ToolContext } from "@gonk/tool-registry"
import {
  imageEditInputJsonSchema,
  imageEditOutputJsonSchema,
} from "@workspace/agent-tools/image"

export const IMAGE_EDIT_CAPABILITY = {
  capabilityId: "image_edit",
  revision: "1",
  inputJsonSchema: imageEditInputJsonSchema,
  outputJsonSchema: imageEditOutputJsonSchema,
} as const

export async function resolveFabricImageEditMetadata(
  input: unknown,
  context: ToolContext,
  fabricHost: Pick<EveFabricHost, "installationId" | "workerId">,
): Promise<FabricDispatchMetadataV1> {
  const principal = context.auth?.principal
  const fabric = (context.host as EveFabricToolHostContext | undefined)?.fabric
  if (!principal || !fabric) {
    throw new Error(
      "Fabric image editing requires an authenticated Eve run execution",
    )
  }
  const authorization = await context.auth!.authorize({
    action: "tool.invoke",
    resource: {
      kind: "tool",
      target: IMAGE_EDIT_CAPABILITY.capabilityId,
    },
  })
  if (authorization.outcome !== "allow") {
    throw new Error("Fabric image editing authorization was denied")
  }
  const now = Date.now()
  const expiresAt = now + 5 * 60_000
  const sourceArtifactId = sourceArtifactIdFromInput(input)
  const authorizationReceiptRef = [
    "gonk-authz",
    authorization.policyId,
    fabricExecutionBindingDigest({
      principalId: principal.id,
      capabilityId: IMAGE_EDIT_CAPABILITY.capabilityId,
      runExecutionId: fabric.executionContext.runExecutionId,
    }),
  ].join(":")

  return {
    installationId: fabricHost.installationId,
    principalId: principal.id,
    audienceWorkerId: fabricHost.workerId,
    authorizationReceiptRef,
    executionPolicy: {
      policyRef: "sigil-chat:image-edit:v1",
      restrictionPolicyRefs: [...fabric.restrictionPolicyRefs],
      retrySafety: "safe",
      continuity: { mode: "stateless" },
      model: {
        provider:
          process.env.GONK_FABRIC_IMAGE_EDIT_PROVIDER ??
          process.env.GONK_FABRIC_IMAGE_PROVIDER ??
          "comfyui",
        modelId:
          process.env.GONK_FABRIC_IMAGE_EDIT_MODEL_ID ??
          process.env.GONK_FABRIC_IMAGE_MODEL_ID ??
          "local/chroma",
        allowedFallbacks: [],
      },
    },
    executionContext: structuredClone(fabric.executionContext),
    observedTurnId: fabric.observedTurnId,
    scopeContextDigest: fabricExecutionBindingDigest({
      principalId: principal.id,
      scopes: principal.scopes,
      executionBindingDigest:
        fabric.executionContext.executionBindingDigest,
    }),
    artifactAccess: [
      ...(sourceArtifactId
        ? [
            {
              accessRef: [
                "fabric-artifact-read",
                fabric.executionContext.runExecutionId,
                "source",
              ].join(":"),
              artifactId: sourceArtifactId,
              operation: "read" as const,
              maxBytes: 10 * 1024 * 1024,
              expiresAt: new Date(expiresAt).toISOString(),
            },
          ]
        : []),
      {
        accessRef: [
          "fabric-artifact-write",
          fabric.executionContext.runExecutionId,
          "image",
        ].join(":"),
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
  }
}

function sourceArtifactIdFromInput(input: unknown): string | undefined {
  if (
    typeof input === "object" &&
    input !== null &&
    "sourceArtifactId" in input &&
    typeof input.sourceArtifactId === "string" &&
    input.sourceArtifactId.trim()
  ) {
    return input.sourceArtifactId
  }
  return undefined
}
