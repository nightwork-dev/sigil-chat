import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type ChangeEvent,
} from "react"

// Headless file ingestion: drag-and-drop onto any element, paste from the
// clipboard, and a programmatic native picker — all behind one hook. It does no
// rendering and holds no upload logic; it just turns "the user offered files"
// (however they offered them) into a filtered `File[]` callback. Pair it with
// useAttachments (upload + optimistic status) and your own dropzone markup.
//
// Accept-filtering mirrors the `<input accept>` grammar: comma-separated
// tokens that are extensions (".csv"), full media types ("application/pdf"), or
// wildcard media types ("image/*").

export interface FileRejection {
  readonly file: File
  readonly reason: "type" | "size" | "count"
}

export interface UseFileUploadOptions {
  /** `<input accept>`-style filter. Omit to accept anything. */
  readonly accept?: string
  /** Allow more than one file. Defaults to `true`. */
  readonly multiple?: boolean
  /** Per-file size ceiling in bytes. */
  readonly maxSize?: number
  /** Cap on the number of files accepted from a single drop/paste/pick. */
  readonly maxFiles?: number
  /** Ignore all ingestion while `true`. */
  readonly disabled?: boolean
  /** Called with the files that pass every filter. */
  readonly onFiles?: (files: File[]) => void
  /** Called with the files that failed, and why. */
  readonly onReject?: (rejections: FileRejection[]) => void
}

export interface UseFileUploadResult {
  /** True while a drag is hovering the dropzone (spread `getRootProps`). */
  readonly isDragging: boolean
  /** Open the native file picker programmatically. */
  readonly open: () => void
  /** Spread onto the element that should accept drops. */
  readonly getRootProps: () => {
    readonly onDragEnter: (event: ReactDragEvent) => void
    readonly onDragOver: (event: ReactDragEvent) => void
    readonly onDragLeave: (event: ReactDragEvent) => void
    readonly onDrop: (event: ReactDragEvent) => void
    readonly "data-dragging": "" | undefined
  }
  /** Spread onto a visually-hidden `<input type="file">` for the picker. */
  readonly getInputProps: () => {
    readonly ref: (node: HTMLInputElement | null) => void
    readonly type: "file"
    readonly accept: string | undefined
    readonly multiple: boolean
    readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void
    readonly hidden: true
    readonly tabIndex: -1
  }
  /** Attach to an element's (or window's) paste to ingest pasted image/files. */
  readonly onPaste: (event: ReactClipboardEvent | ClipboardEvent) => void
}

/** True when `file` satisfies an `<input accept>`-style filter. */
export function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept || accept.trim().length === 0) return true
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true

  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()

  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token)
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1))
    return type === token
  })
}

export function useFileUpload(
  options: UseFileUploadOptions = {},
): UseFileUploadResult {
  const {
    accept,
    multiple = true,
    maxSize,
    maxFiles,
    disabled = false,
    onFiles,
    onReject,
  } = options

  const [isDragging, setIsDragging] = useState(false)
  // dragenter/dragleave also fire when crossing child elements; a depth counter
  // keeps `isDragging` from flickering as the pointer moves over children.
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const ingest = useCallback(
    (candidates: File[]) => {
      if (disabled || candidates.length === 0) return
      const limited = multiple ? candidates : candidates.slice(0, 1)

      const accepted: File[] = []
      const rejected: FileRejection[] = []
      for (const file of limited) {
        if (!matchesAccept(file, accept)) {
          rejected.push({ file, reason: "type" })
        } else if (maxSize !== undefined && file.size > maxSize) {
          rejected.push({ file, reason: "size" })
        } else if (maxFiles !== undefined && accepted.length >= maxFiles) {
          rejected.push({ file, reason: "count" })
        } else {
          accepted.push(file)
        }
      }

      if (accepted.length > 0) onFiles?.(accepted)
      if (rejected.length > 0) onReject?.(rejected)
    },
    [accept, disabled, maxFiles, maxSize, multiple, onFiles, onReject],
  )

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const onDragEnter = useCallback(
    (event: ReactDragEvent) => {
      if (disabled) return
      if (!hasFiles(event.dataTransfer)) return
      event.preventDefault()
      dragDepth.current += 1
      setIsDragging(true)
    },
    [disabled],
  )

  const onDragOver = useCallback(
    (event: ReactDragEvent) => {
      if (disabled) return
      if (!hasFiles(event.dataTransfer)) return
      // Required for the drop to fire, and to show the copy cursor.
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    },
    [disabled],
  )

  const onDragLeave = useCallback(
    (event: ReactDragEvent) => {
      if (disabled) return
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setIsDragging(false)
    },
    [disabled],
  )

  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      if (disabled) return
      event.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      ingest(Array.from(event.dataTransfer.files ?? []))
    },
    [disabled, ingest],
  )

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      ingest(Array.from(event.target.files ?? []))
      // Reset so selecting the same file again re-fires change.
      event.target.value = ""
    },
    [ingest],
  )

  const onPaste = useCallback(
    (event: ReactClipboardEvent | ClipboardEvent) => {
      if (disabled) return
      const clipboard = event.clipboardData
      if (!clipboard) return
      const files: File[] = []
      for (const item of clipboard.items) {
        if (item.kind === "file") {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        event.preventDefault()
        ingest(files)
      }
    },
    [disabled, ingest],
  )

  const getRootProps = useCallback(
    () =>
      ({
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
        "data-dragging": isDragging ? "" : undefined,
      }) as const,
    [isDragging, onDragEnter, onDragLeave, onDragOver, onDrop],
  )

  const getInputProps = useCallback(
    () =>
      ({
        ref: (node: HTMLInputElement | null) => {
          inputRef.current = node
        },
        type: "file",
        accept,
        multiple,
        onChange: onInputChange,
        hidden: true,
        tabIndex: -1,
      }) as const,
    [accept, multiple, onInputChange],
  )

  return useMemo(
    () => ({ isDragging, open, getRootProps, getInputProps, onPaste }),
    [getInputProps, getRootProps, isDragging, onPaste, open],
  )
}

function hasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  // During dragover the file list is empty but `types` includes "Files".
  return Array.from(dataTransfer.types).includes("Files")
}
