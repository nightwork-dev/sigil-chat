import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { AGENT_SCOPE_HEADER } from "./agent-session-scope";

/**
 * Uploads a chat attachment (image or file) to the Gonk artifact store and
 * returns the served URL plus metadata.
 *
 * The browser never talks to Gonk directly and never sees `GONK_MCP_KEY` —
 * that bearer key also authorizes the MCP tool surface, so shipping it to
 * the client would defeat the point of gating it. This server function runs
 * on the web app's own Node process (which already receives `GONK_MCP_KEY`
 * via `turbo.json`'s `globalPassThroughEnv`, the same way `apps/agent`
 * does), reads the key server-side, and proxies the raw bytes to Gonk's
 * authenticated `/upload` route. `/img/<key>` reads stay unauthenticated
 * (content-addressed, unguessable) — only this write path is gated.
 */
export interface UploadedAttachment {
  readonly url: string;
  readonly key: string;
  readonly mediaType: string;
  readonly size: number;
  readonly filename?: string;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const uploadAttachmentFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<UploadedAttachment> => {
    const file = data.get("file");
    const scope = data.get("scope");
    if (typeof scope !== "string" || scope.trim().length === 0) {
      throw new Error("Attachment upload requires a resource scope.");
    }
    if (!(file instanceof File)) {
      throw new Error("Attachment upload requires a `file` field.");
    }
    if (file.size === 0) {
      throw new Error("Attachment file is empty.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `Attachment is too large (${file.size} bytes; limit ${MAX_ATTACHMENT_BYTES} bytes).`,
      );
    }

    const { readGonkClientEnvironment } = await import(
      "@workspace/runtime-env/server"
    );
    const { apiKey, gonkMcpUrl } = readGonkClientEnvironment(process.env);
    if (!apiKey) {
      throw new Error(
        "GONK_MCP_KEY is not configured for the web app's server process; attachment uploads cannot be authenticated against Gonk.",
      );
    }
    const uploadUrl = gonkMcpUrl.replace(/\/mcp\/?$/, "/upload");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": file.name,
        [AGENT_SCOPE_HEADER]: scope,
        authorization: `Bearer ${apiKey}`,
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(
        `Attachment upload failed (${response.status} ${response.statusText})`,
      );
    }

    return (await response.json()) as UploadedAttachment;
  });

export function useUploadAgentAttachment() {
  return useMutation({
    mutationFn: async (input: {
      file: File;
      scope: string;
    }): Promise<UploadedAttachment> => {
      const formData = new FormData();
      formData.set("file", input.file);
      formData.set("scope", input.scope);
      return uploadAttachmentFn({ data: formData });
    },
  });
}
