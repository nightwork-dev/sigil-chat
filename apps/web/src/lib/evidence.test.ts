import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization"
import type { SessionArtifactStore } from "@workspace/artifact-store/repository"
import { describe, expect, it, vi } from "vitest"

import type { ScopeAuthorizationRegistries } from "../../../agent/agent/lib/scope-authorization"
import type { SigilAuthSession } from "./auth/server"
import {
  deleteEvidenceDocument,
  listEvidenceDistills,
  listEvidenceDocuments,
  type EvidenceRoomAccessDependencies,
  uploadEvidenceDocument,
} from "./evidence.server"

const session: SigilAuthSession = {
  session: {
    expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    id: "session-1",
  },
  user: {
    email: "member@example.test",
    id: "user-1",
    name: "Member",
    role: "member",
  },
}

describe("Evidence Room authorization", () => {
  it.each([
    {
      action: "read",
      name: "document listing",
      run: (dependencies: EvidenceRoomAccessDependencies) =>
        listEvidenceDocuments(dependencies),
    },
    {
      action: "read",
      name: "distill listing",
      run: (dependencies: EvidenceRoomAccessDependencies) =>
        listEvidenceDistills(dependencies),
    },
    {
      action: "tool",
      name: "upload",
      run: (dependencies: EvidenceRoomAccessDependencies) =>
        uploadEvidenceDocument(
          new File(["evidence"], "evidence.txt", { type: "text/plain" }),
          dependencies,
        ),
    },
    {
      action: "tool",
      name: "delete",
      run: (dependencies: EvidenceRoomAccessDependencies) =>
        deleteEvidenceDocument("artifact-1", dependencies),
    },
  ])(
    "denies $name before touching the artifact store",
    async ({ action, run }) => {
      const authorize = vi.fn(() => false)
      const store = createArtifactStoreSpy()
      const dependencies = createDependencies({ authorize, store })

      await expect(run(dependencies)).rejects.toThrow(
        "EVE_RESOURCE_SCOPE_NOT_AUTHORIZED",
      )
      expect(authorize).toHaveBeenCalledWith({
        action,
        principalId: "user-1",
        resourceScope: "project:personal:user-1",
      })
      expect(store.listByScope).not.toHaveBeenCalled()
      expect(store.readContent).not.toHaveBeenCalled()
      expect(store.putFile).not.toHaveBeenCalled()
      expect(store.removeFromScope).not.toHaveBeenCalled()
    },
  )
})

function createDependencies(input: {
  authorize: ScopeAuthorizationPolicy["authorize"]
  store: ReturnType<typeof createArtifactStoreSpy>
}): EvidenceRoomAccessDependencies {
  const registries = {
    projects: {
      get: (id: string) =>
        id === "personal:user-1"
          ? {
              id,
              name: "Personal project",
              description: "Registered personal project.",
              members: [{ principalId: "user-1", role: "member" as const }],
              settings: {},
              createdAt: "2026-07-23T00:00:00.000Z",
              createdBy: "user-1",
            }
          : undefined,
    },
    workspaces: { get: () => undefined },
  } satisfies ScopeAuthorizationRegistries

  return {
    getSession: () => Promise.resolve(session),
    ownedThreadHomeScope: () => undefined,
    personalProjectIdFor: (principalId) => `personal:${principalId}`,
    policy: { authorize: input.authorize },
    registries,
    store: input.store as unknown as SessionArtifactStore,
  }
}

function createArtifactStoreSpy() {
  return {
    listByScope: vi.fn(),
    putFile: vi.fn(),
    readContent: vi.fn(),
    removeFromScope: vi.fn(),
  }
}
