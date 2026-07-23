import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getSession, requireSession } from "./auth/session";
import { type DistilledArtifact } from "@/components/agent/distilled-artifact-card";

// Wire contract with @workspace/agent-tools/distill: distilled
// artifacts are stored at the turn's scope with this media type, so they land in
// the room's corpus alongside documents and we split the two by media type.
const DISTILL_MEDIA_TYPE = "application/vnd.sigil.distill+json";

/**
 * D4.4 Evidence Room persistence. The document corpus lives at a stable
 * PROJECT-tier scope so it survives sessions and reloads, rather than using
 * the per-thread session scope reserved for ephemeral chat attachments.
 *
 * Every path is session-gated and handled server-side by the web app's shared
 * artifact repository. The browser receives only same-origin resource URLs.
 */
export const EVIDENCE_ROOM_SCOPE = "project:evidence-room";

export interface EvidenceDocument {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly url: string;
}

/** A distilled card the agent produced into this room's corpus. */
export interface EvidenceDistill {
  readonly artifactId: string;
  readonly distilled: DistilledArtifact;
}

export const evidenceKeys = {
  all: () => ["evidence"] as const,
  documents: () => ["evidence", "documents", EVIDENCE_ROOM_SCOPE] as const,
  distills: () => ["evidence", "distills", EVIDENCE_ROOM_SCOPE] as const,
};

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

const listEvidenceDocumentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDocument[]> => {
    requireSession(await getSession());
    const { getWebArtifactStore, artifactUrlForWeb } =
      await import("./artifact-repository.server");
    const artifacts =
      await getWebArtifactStore().listByScope(EVIDENCE_ROOM_SCOPE);
    // Distilled cards live in the same scope; the library lists documents only.
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
  },
);

const listEvidenceDistillsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDistill[]> => {
    requireSession(await getSession());
    const { getWebArtifactStore } =
      await import("./artifact-repository.server");
    const store = getWebArtifactStore();
    const artifacts = await store.listByScope(EVIDENCE_ROOM_SCOPE);
    const distillMetas = artifacts.filter(
      (artifact) => artifact.mediaType === DISTILL_MEDIA_TYPE,
    );

    const distills = await Promise.all(
      distillMetas.map(async (meta): Promise<EvidenceDistill | null> => {
        try {
          const content = await store.readContent(meta.id, EVIDENCE_ROOM_SCOPE);
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
  },
);

const uploadEvidenceDocumentFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<EvidenceDocument> => {
    requireSession(await getSession());
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new Error("Evidence upload requires a `file` field.");
    }
    if (file.size === 0) {
      throw new Error("Evidence file is empty.");
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      throw new Error(
        `Evidence document is too large (${file.size} bytes; limit ${MAX_EVIDENCE_BYTES} bytes).`,
      );
    }

    const { getWebArtifactStore, artifactUrlForWeb } =
      await import("./artifact-repository.server");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await getWebArtifactStore().putFile({
      bytes,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      scope: EVIDENCE_ROOM_SCOPE,
    });
    return {
      id: uploaded.id,
      filename: uploaded.filename,
      mediaType: uploaded.mediaType,
      size: uploaded.size,
      createdAt: uploaded.createdAt,
      url: artifactUrlForWeb(uploaded),
    };
  });

const deleteEvidenceDocumentFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ deleted: boolean; id: string }> => {
    requireSession(await getSession());
    const { getWebArtifactStore } =
      await import("./artifact-repository.server");
    const deleted = await getWebArtifactStore().removeFromScope(
      data.id,
      EVIDENCE_ROOM_SCOPE,
    );
    return { deleted, id: data.id };
  });

export function useEvidenceDocuments() {
  return useQuery({
    queryKey: evidenceKeys.documents(),
    queryFn: () => listEvidenceDocumentsFn(),
  });
}

export function useEvidenceDistills() {
  return useQuery({
    queryKey: evidenceKeys.distills(),
    queryFn: () => listEvidenceDistillsFn(),
  });
}

export function useUploadEvidenceDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return uploadEvidenceDocumentFn({ data: formData });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: evidenceKeys.documents() }),
  });
}

export function useDeleteEvidenceDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEvidenceDocumentFn({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: evidenceKeys.documents() }),
  });
}
