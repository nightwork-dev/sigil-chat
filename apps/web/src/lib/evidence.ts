import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { AGENT_SCOPE_HEADER } from "./agent-session-scope";
import { getSession, requireSession } from "./auth/session";
import { type DistilledArtifact } from "@/components/agent/distilled-artifact-card";

// Wire contract with apps/gonk `registry/distill.ts` DISTILL_MEDIA_TYPE: distilled
// artifacts are stored at the turn's scope with this media type, so they land in
// the room's corpus alongside documents and we split the two by media type.
const DISTILL_MEDIA_TYPE = "application/vnd.sigil.distill+json";

/**
 * D4.4 Evidence Room persistence. The document corpus lives at a stable
 * PROJECT-tier scope so it survives sessions and reloads, rather than using
 * the per-thread session scope reserved for ephemeral chat attachments.
 *
 * Every path is session-gated and proxied server-side: the browser never talks
 * to Gonk directly, never becomes
 * an MCP client, and never sees `GONK_MCP_KEY`. This web process holds the key
 * (via turbo `globalPassThroughEnv`) and forwards it to Gonk's authenticated
 * `/artifacts`, `/upload`, and `/img/<key>` routes.
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
    const artifacts = (await response.json()) as EvidenceDocument[];
    // Distilled cards live in the same scope; the library lists documents only.
    return artifacts.filter((doc) => doc.mediaType !== DISTILL_MEDIA_TYPE);
  },
);

const listEvidenceDistillsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceDistill[]> => {
    requireSession(await getSession());
    const { readGonkClientEnvironment } = await import(
      "@workspace/runtime-env/server"
    );
    const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
    if (!apiKey) {
      throw new Error(
        "GONK_MCP_KEY is not configured for the web app's server process; the Evidence Room cannot reach Gonk.",
      );
    }
    const artifactsUrl = gonkMcpUrl.replace(/\/mcp\/?$/, "/artifacts");
    const imgBase = gonkMcpUrl.replace(/\/mcp\/?$/, "");

    const response = await fetch(artifactsUrl, {
      method: "GET",
      headers: {
        [AGENT_SCOPE_HEADER]: EVIDENCE_ROOM_SCOPE,
        authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Evidence distill list failed (${response.status} ${response.statusText})`,
      );
    }
    const artifacts = (await response.json()) as EvidenceDocument[];
    const distillMetas = artifacts.filter(
      (artifact) => artifact.mediaType === DISTILL_MEDIA_TYPE,
    );

    // Each distill's bytes are DistilledArtifact JSON. This server-side read
    // uses the same service bearer as every other Gonk artifact operation.
    const distills = await Promise.all(
      distillMetas.map(async (meta): Promise<EvidenceDistill | null> => {
        const content = await fetch(`${imgBase}/img/${meta.id}`, {
          headers: { authorization: `Bearer ${apiKey}` },
        });
        if (!content.ok) return null;
        try {
          const distilled = (await content.json()) as DistilledArtifact;
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
