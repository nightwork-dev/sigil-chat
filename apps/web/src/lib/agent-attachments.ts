import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/**
 * Uploads a chat attachment (image or file) to the shared artifact store and
 * returns the served URL plus metadata.
 *
 * The browser never talks to the artifact repository directly. This server
 * function writes bytes through the web app's authenticated server boundary;
 * `/api/media/artifact` reads are session-gated and same-origin.
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
