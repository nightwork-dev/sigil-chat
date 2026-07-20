import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

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
 * authenticated `/upload` route. `/img/<key>` reads are session-gated
 * (content-addressed, unguessable) and are proxied same-origin by the web app
 * (vite.config.ts), so the browser never talks to Gonk directly for either the
 * read or the write — only this write path is bearer-gated.
 */
export interface UploadedAttachment {
  readonly url: string;
  readonly key: string;
  readonly mediaType: string;
  readonly size: number;
  readonly filename?: string;
}

const uploadAttachmentFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<UploadedAttachment> => {
    const { uploadAgentAttachmentFromRequest } = await import(
      "./agent-attachments.server"
    )
    return uploadAgentAttachmentFromRequest(data)
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
