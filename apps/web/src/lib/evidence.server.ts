import type { DistilledArtifact } from "@/components/agent/distilled-artifact-card";

import {
  artifactUrlForWeb,
  authorizeArtifactScopeForSession,
  type WebArtifactStoreDependencies,
} from "./artifact-repository.server";
import { getSession, requireSession } from "./auth/session";

const DISTILL_MEDIA_TYPE = "application/vnd.sigil.distill+json";
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export interface EvidenceDocument {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly url: string;
}

export interface EvidenceDistill {
  readonly artifactId: string;
  readonly distilled: DistilledArtifact;
}

export interface EvidenceRoomAccessDependencies
  extends WebArtifactStoreDependencies {
  readonly personalProjectIdFor: (principalId: string) => string;
}

export async function listEvidenceDocuments(
  dependencies: EvidenceRoomAccessDependencies,
): Promise<EvidenceDocument[]> {
  const { scope, store, principal } = await authorizeEvidenceRoom(
    dependencies,
    "read",
  );
  const artifacts = await store.listByScope(scope, principal);
  return artifacts
    .filter((doc) => doc.mediaType !== DISTILL_MEDIA_TYPE)
    .map((artifact) => ({
      id: artifact.id,
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      size: artifact.size,
      createdAt: artifact.createdAt,
      url: artifactUrlForWeb(artifact),
    }));
}

export async function listEvidenceDistills(
  dependencies: EvidenceRoomAccessDependencies,
): Promise<EvidenceDistill[]> {
  const { scope, store, principal } = await authorizeEvidenceRoom(
    dependencies,
    "read",
  );
  const artifacts = await store.listByScope(scope, principal);
  const distillMetas = artifacts.filter(
    (artifact) => artifact.mediaType === DISTILL_MEDIA_TYPE,
  );
  const distills = await Promise.all(
    distillMetas.map(async (meta): Promise<EvidenceDistill | null> => {
      try {
        const content = await store.readContent(meta.id, scope, principal);
        const distilled = JSON.parse(
          new TextDecoder().decode(content.bytes),
        ) as DistilledArtifact;
        if (typeof distilled?.title !== "string") return null;
        return { artifactId: meta.id, distilled };
      } catch {
        return null;
      }
    }),
  );
  return distills.filter((entry): entry is EvidenceDistill => entry !== null);
}

export async function uploadEvidenceDocument(
  file: File,
  dependencies: EvidenceRoomAccessDependencies,
): Promise<EvidenceDocument> {
  const { scope, store, principal } = await authorizeEvidenceRoom(
    dependencies,
    "tool",
  );
  if (file.size === 0) {
    throw new Error("Evidence file is empty.");
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `Evidence document is too large (${file.size} bytes; limit ${MAX_EVIDENCE_BYTES} bytes).`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await store.putFile(
    {
      bytes,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      scope,
    },
    principal,
  );
  return {
    id: uploaded.id,
    filename: uploaded.filename,
    mediaType: uploaded.mediaType,
    size: uploaded.size,
    createdAt: uploaded.createdAt,
    url: artifactUrlForWeb(uploaded),
  };
}

export async function deleteEvidenceDocument(
  id: string,
  dependencies: EvidenceRoomAccessDependencies,
): Promise<{ deleted: boolean; id: string }> {
  const { scope, store, principal } = await authorizeEvidenceRoom(
    dependencies,
    "tool",
  );
  const deleted = await store.removeFromScope(id, scope, principal);
  return { deleted, id };
}

export async function evidenceRoomAccessDependencies(): Promise<EvidenceRoomAccessDependencies> {
  const [{ agentThreadRepository }, { loadProjectWorkspaceNav }] =
    await Promise.all([
      import("./agent-threads.server"),
      import("./agent-thread-containers.server"),
    ]);
  return {
    getSession,
    ownedThreadHomeScope: (userId, threadId) =>
      agentThreadRepository.get(userId, threadId)?.executionBinding?.homeScopeId,
    personalProjectIdFor: (principalId) =>
      loadProjectWorkspaceNav(principalId).personalProjectId,
  };
}

async function authorizeEvidenceRoom(
  dependencies: EvidenceRoomAccessDependencies,
  mode: "read" | "tool",
) {
  const session = await dependencies.getSession();
  requireSession(session);
  const scope = `project:${dependencies.personalProjectIdFor(session.user.id)}`;
  return {
    scope,
    ...authorizeArtifactScopeForSession(scope, session, dependencies, mode),
  };
}
