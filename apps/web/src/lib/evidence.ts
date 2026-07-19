import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { AGENT_SCOPE_HEADER } from "./agent-session-scope";
import { getSession, requireSession } from "./auth/session";

/**
 * D4.4 Evidence Room persistence. The document corpus lives at a stable
 * PROJECT-tier scope so it survives sessions and reloads (David: "an actual
 * product that I can use to load data into persistently"), not the per-thread
 * session scope chat attachments use.
 *
 * Every path is session-gated and proxied server-side (codex's ratified
 * read-path contract): the browser never talks to Gonk directly, never becomes
 * an MCP client, and never sees `GONK_MCP_KEY`. This web process holds the key
 * (via turbo `globalPassThroughEnv`) and forwards it to Gonk's authenticated
 * `/artifacts` + `/upload` routes; `/img/<key>` reads stay unauthenticated and
 * are proxied same-origin (vite.config.ts).
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

export const evidenceKeys = {
  all: () => ["evidence"] as const,
  documents: () => ["evidence", "documents", EVIDENCE_ROOM_SCOPE] as const,
};

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

async function gonkArtifactsEndpoint(): Promise<{
  url: string;
  apiKey: string;
}> {
  const { readGonkClientEnvironment } = await import(
    "@workspace/runtime-env/server"
  );
  const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
  if (!apiKey) {
    throw new Error(
      "GONK_MCP_KEY is not configured for the web app's server process; the Evidence Room cannot reach Gonk.",
    );
  }
  return { url: gonkMcpUrl.replace(/\/mcp\/?$/, "/artifacts"), apiKey };
}

const listEvidenceDocumentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDocument[]> => {
    requireSession(await getSession());
    const { url, apiKey } = await gonkArtifactsEndpoint();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        [AGENT_SCOPE_HEADER]: EVIDENCE_ROOM_SCOPE,
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Evidence document list failed (${response.status} ${response.statusText})`,
      );
    }
    return (await response.json()) as EvidenceDocument[];
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

    const { readGonkClientEnvironment } = await import(
      "@workspace/runtime-env/server"
    );
    const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
    if (!apiKey) {
      throw new Error(
        "GONK_MCP_KEY is not configured for the web app's server process; Evidence uploads cannot be authenticated against Gonk.",
      );
    }
    const uploadUrl = gonkMcpUrl.replace(/\/mcp\/?$/, "/upload");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": file.name,
        [AGENT_SCOPE_HEADER]: EVIDENCE_ROOM_SCOPE,
        authorization: `Bearer ${apiKey}`,
      },
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(
        `Evidence upload failed (${response.status} ${response.statusText})`,
      );
    }
    const uploaded = (await response.json()) as {
      key: string;
      url: string;
      mediaType: string;
      size: number;
      filename?: string;
    };
    return {
      id: uploaded.key,
      filename: uploaded.filename ?? file.name,
      mediaType: uploaded.mediaType,
      size: uploaded.size,
      createdAt: new Date().toISOString(),
      url: uploaded.url,
    };
  });

const deleteEvidenceDocumentFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ deleted: boolean; id: string }> => {
    requireSession(await getSession());
    const { url, apiKey } = await gonkArtifactsEndpoint();
    const response = await fetch(`${url}/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: {
        [AGENT_SCOPE_HEADER]: EVIDENCE_ROOM_SCOPE,
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Evidence delete failed (${response.status} ${response.statusText})`,
      );
    }
    return (await response.json()) as { deleted: boolean; id: string };
  });

export function useEvidenceDocuments() {
  return useQuery({
    queryKey: evidenceKeys.documents(),
    queryFn: () => listEvidenceDocumentsFn(),
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
