import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"
import { makeBaseContext } from "@gonk/tool-registry"
import type { ToolContext } from "@gonk/tool-registry"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  IMAGE_EDIT_CAPABILITY,
  resolveFabricImageEditMetadata,
} from "./fabric-image-edit"
import { createFabricToolHostContext } from "./gonk-tool-context"

const principal: AuthenticatedPrincipal = {
  id: "owner-1",
  kind: "human" as const,
  identity: {
    issuer: "sigil-chat",
    subject: "owner-1",
    method: "local",
  },
  roles: ["owner"],
  scopes: ["session:thread-1"],
}

describe("Fabric image edit metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("declares image_edit@1 over the existing sigil-edit-image contract", () => {
    expect(IMAGE_EDIT_CAPABILITY).toMatchObject({
      capabilityId: "image_edit",
      revision: "1",
      inputJsonSchema: {
        required: ["instruction"],
        oneOf: [
          { required: ["sourceArtifactId"] },
          { required: ["inlineImage"] },
        ],
      },
      outputJsonSchema: {
        required: [
          "artifactId",
          "url",
          "mediaType",
          "backend",
          "sourceArtifactId",
          "instruction",
          "prompt",
        ],
      },
    })
  })

  it("authorizes image_edit and grants exact source-read plus output-write artifact access", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-02T04:00:00.000Z"))
    vi.stubEnv("GONK_FABRIC_IMAGE_PROVIDER", "comfyui")
    vi.stubEnv("GONK_FABRIC_IMAGE_MODEL_ID", "local/base")
    vi.stubEnv("GONK_FABRIC_IMAGE_EDIT_PROVIDER", "codex")
    vi.stubEnv("GONK_FABRIC_IMAGE_EDIT_MODEL_ID", "gpt-image-1")
    const authorize = vi.fn(() => ({
      outcome: "allow" as const,
      policyId: "sigil-chat.policy",
      reason: "test",
    }))

    const metadata = await resolveFabricImageEditMetadata(
      {
        sourceArtifactId: "uploads/source.png",
        instruction: "Make the jacket green",
      },
      makeBaseContext({
        auth: {
          principal,
          authorize,
        } satisfies AuthContext,
        host: {
          resourceScope: "session:thread-1",
          fabric: fabricContext(),
        },
      }) as ToolContext,
      {
        installationId: "sigil-installation",
        workerId: "worker-image",
      },
    )

    expect(authorize).toHaveBeenCalledWith({
      action: "tool.invoke",
      resource: { kind: "tool", target: "image_edit" },
    })
    expect(metadata).toMatchObject({
      installationId: "sigil-installation",
      principalId: "owner-1",
      audienceWorkerId: "worker-image",
      executionPolicy: {
        policyRef: "sigil-chat:image-edit:v1",
        restrictionPolicyRefs: ["private-local"],
        retrySafety: "safe",
        model: {
          provider: "codex",
          modelId: "gpt-image-1",
          allowedFallbacks: [],
        },
      },
      artifactAccess: [
        {
          accessRef:
            "fabric-artifact-read:sigil-chat:eve:eve-session-1:turn:turn-1:source",
          artifactId: "uploads/source.png",
          operation: "read",
          maxBytes: 10 * 1024 * 1024,
          expiresAt: "2026-08-02T04:05:00.000Z",
        },
        {
          accessRef:
            "fabric-artifact-write:sigil-chat:eve:eve-session-1:turn:turn-1:image",
          outputSlot: "image",
          operation: "write",
          maxBytes: 25 * 1024 * 1024,
          expiresAt: "2026-08-02T04:05:00.000Z",
        },
      ],
    })
    expect(metadata.authorizationReceiptRef).toMatch(/^gonk-authz:sigil-chat\.policy:sha256:/)
    expect(metadata.scopeContextDigest).toMatch(/^sha256:/)
  })

  it("fails before dispatch metadata when image_edit authorization is denied", async () => {
    await expect(
      resolveFabricImageEditMetadata(
        {
          inlineImage: {
            base64: Buffer.from([1, 2, 3]).toString("base64"),
            mediaType: "image/png",
          },
          instruction: "Crop to the face",
        },
        makeBaseContext({
          auth: {
            principal,
            authorize: () => ({
              outcome: "deny",
              policyId: "sigil-chat.policy",
              reason: "test denial",
            }),
          } satisfies AuthContext,
          host: {
            resourceScope: "session:thread-1",
            fabric: fabricContext(),
          },
        }) as ToolContext,
        {
          installationId: "sigil-installation",
          workerId: "worker-image",
        },
      ),
    ).rejects.toThrow("Fabric image editing authorization was denied")
  })
})

function fabricContext() {
  return createFabricToolHostContext({
    binding: {
      subject: "owner-1",
      applicationThreadId: "thread-1",
      personaId: "eve",
      homeScopeId: "personal:owner-1",
      initialPerspective: {
        focusScopeId: "personal:owner-1",
        viaScopeIds: [],
      },
      additionalContextScopeIds: [],
    },
    callId: "call-1",
    eveSessionId: "eve-session-1",
    principalId: "owner-1",
    resourceScope: "session:thread-1",
    subject: "owner-1",
    turnId: "turn-1",
    restrictionPolicyRefs: ["private-local"],
  })
}
