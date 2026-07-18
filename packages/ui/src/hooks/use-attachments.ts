import { useCallback, useMemo, useState } from "react"

// The optimistic attachment list: pick/drop/paste files, show them immediately
// as "uploading", then flip each to "uploaded" (with a served URL) or "error"
// as its upload settles. Storage is injected — the hook knows nothing about
// where bytes go, only that `upload(file)` returns a URL and metadata. This is
// the generic core extracted from a chat compose bar; pair it with
// useFileUpload for ingestion and your own chip UI for display.

export interface UploadedFile {
  readonly url: string
  readonly mediaType: string
  readonly filename?: string
  readonly size?: number
}

export type AttachmentStatus = "uploading" | "uploaded" | "error"

export interface Attachment {
  readonly id: string
  readonly filename: string
  readonly mediaType: string
  /** Present once uploaded (or immediately, for a URL added by reference). */
  readonly url?: string
  readonly status: AttachmentStatus
  readonly errorMessage?: string
  readonly size?: number
}

/** An attachment that has finished uploading and has a usable URL. */
export type ReadyAttachment = Attachment & {
  readonly status: "uploaded"
  readonly url: string
}

export interface UseAttachmentsOptions {
  /** Upload one file and resolve to its served URL + metadata. Injected so the
   *  hook stays storage-agnostic. */
  readonly upload: (file: File) => Promise<UploadedFile>
  /** Notified when a file's upload fails (in addition to the error status). */
  readonly onError?: (error: unknown, file: File) => void
}

export interface UseAttachmentsResult {
  readonly attachments: readonly Attachment[]
  /** Upload each file, showing it optimistically as "uploading" first. */
  readonly addFiles: (files: readonly File[]) => void
  /** Add an already-hosted URL as a ready attachment (e.g. a pasted image
   *  link) — no upload. */
  readonly addUrl: (url: string, meta?: Partial<UploadedFile>) => void
  readonly remove: (id: string) => void
  readonly clear: () => void
  /** Replace the whole list — for restoring after a failed send. */
  readonly setAttachments: (attachments: readonly Attachment[]) => void
  /** True while any attachment is still uploading. */
  readonly isUploading: boolean
  /** The subset that finished and can be sent. */
  readonly ready: readonly ReadyAttachment[]
}

export function useAttachments(
  options: UseAttachmentsOptions,
): UseAttachmentsResult {
  const { upload, onError } = options
  const [attachments, setList] = useState<readonly Attachment[]>([])

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...next } : item)),
    )
  }, [])

  const addFiles = useCallback(
    (files: readonly File[]) => {
      for (const file of files) {
        const id = crypto.randomUUID()
        setList((prev) => [
          ...prev,
          {
            id,
            filename: file.name,
            mediaType: file.type || "application/octet-stream",
            status: "uploading",
            size: file.size,
          },
        ])
        void upload(file).then(
          (result) =>
            patch(id, {
              status: "uploaded",
              url: result.url,
              mediaType: result.mediaType,
              filename: result.filename ?? file.name,
              size: result.size ?? file.size,
            }),
          (error) => {
            patch(id, {
              status: "error",
              errorMessage:
                error instanceof Error ? error.message : "Upload failed",
            })
            onError?.(error, file)
          },
        )
      }
    },
    [onError, patch, upload],
  )

  const addUrl = useCallback(
    (url: string, meta: Partial<UploadedFile> = {}) => {
      setList((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          filename: meta.filename ?? filenameFromUrl(url),
          mediaType: meta.mediaType ?? "application/octet-stream",
          status: "uploaded",
          url,
          size: meta.size,
        },
      ])
    },
    [],
  )

  const remove = useCallback((id: string) => {
    setList((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clear = useCallback(() => setList([]), [])

  const setAttachments = useCallback(
    (next: readonly Attachment[]) => setList(next),
    [],
  )

  const isUploading = attachments.some((item) => item.status === "uploading")
  const ready = useMemo(
    () =>
      attachments.filter(
        (item): item is ReadyAttachment =>
          item.status === "uploaded" && Boolean(item.url),
      ),
    [attachments],
  )

  return {
    attachments,
    addFiles,
    addUrl,
    remove,
    clear,
    setAttachments,
    isUploading,
    ready,
  }
}

function filenameFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url)
    const last = pathname.split("/").filter(Boolean).at(-1)
    return last && last.length > 0 ? decodeURIComponent(last) : "attachment"
  } catch {
    return "attachment"
  }
}
