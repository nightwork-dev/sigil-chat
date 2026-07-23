import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useProjectWorkspaceNav } from "./project-workspace-nav";
import type {
  EvidenceDistill,
  EvidenceDocument,
} from "./evidence.server";

export type { EvidenceDistill, EvidenceDocument } from "./evidence.server";

/**
 * D4.4 Evidence Room persistence. Each principal's corpus lives in their
 * registered personal project so it survives sessions and reloads without
 * becoming a deployment-global demo scope.
 *
 * Every operation resolves that scope from the authenticated session, then
 * passes through the same project membership policy used by agent tools.
 */
export const evidenceKeys = {
  all: () => ["evidence"] as const,
  documents: (scope: string) => ["evidence", "documents", scope] as const,
  distills: (scope: string) => ["evidence", "distills", scope] as const,
};

const listEvidenceDocumentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDocument[]> => {
    const { evidenceRoomAccessDependencies, listEvidenceDocuments } =
      await import("./evidence.server");
    return listEvidenceDocuments(await evidenceRoomAccessDependencies());
  },
);

const listEvidenceDistillsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDistill[]> => {
    const { evidenceRoomAccessDependencies, listEvidenceDistills } =
      await import("./evidence.server");
    return listEvidenceDistills(await evidenceRoomAccessDependencies());
  },
);

const uploadEvidenceDocumentFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<EvidenceDocument> => {
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new Error("Evidence upload requires a `file` field.");
    }
    const { evidenceRoomAccessDependencies, uploadEvidenceDocument } =
      await import("./evidence.server");
    return uploadEvidenceDocument(
      file,
      await evidenceRoomAccessDependencies(),
    );
  });

const deleteEvidenceDocumentFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ deleted: boolean; id: string }> => {
    const { deleteEvidenceDocument, evidenceRoomAccessDependencies } =
      await import("./evidence.server");
    return deleteEvidenceDocument(
      data.id,
      await evidenceRoomAccessDependencies(),
    );
  });

export function useEvidenceRoomScope(): string | null {
  const nav = useProjectWorkspaceNav();
  return nav.data ? `project:${nav.data.personalProjectId}` : null;
}

export function useEvidenceDocuments(scope: string | null) {
  return useQuery({
    queryKey: evidenceKeys.documents(scope ?? "pending"),
    queryFn: () => listEvidenceDocumentsFn(),
    enabled: scope !== null,
  });
}

export function useEvidenceDistills(scope: string | null) {
  return useQuery({
    queryKey: evidenceKeys.distills(scope ?? "pending"),
    queryFn: () => listEvidenceDistillsFn(),
    enabled: scope !== null,
  });
}

export function useUploadEvidenceDocument(scope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      if (!scope) throw new Error("Evidence Room scope is not ready.");
      const formData = new FormData();
      formData.set("file", file);
      return uploadEvidenceDocumentFn({ data: formData });
    },
    onSuccess: () =>
      scope
        ? queryClient.invalidateQueries({
            queryKey: evidenceKeys.documents(scope),
          })
        : undefined,
  });
}

export function useDeleteEvidenceDocument(scope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      if (!scope) throw new Error("Evidence Room scope is not ready.");
      return deleteEvidenceDocumentFn({ data: { id } });
    },
    onSuccess: () =>
      scope
        ? queryClient.invalidateQueries({
            queryKey: evidenceKeys.documents(scope),
          })
        : undefined,
  });
}
