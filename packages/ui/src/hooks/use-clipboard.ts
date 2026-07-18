import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from "react"

// Headless copy/paste with pluggable serialize/parse. The point is the
// round-trip with *other* applications through their own clipboard formats:
//
//   • Copy a structured selection as TSV → paste it into Google Sheets.
//   • Copy from Google Sheets → paste `parse`s the TSV back into your rows.
//   • Paste a block of `.env` lines → `parse` populates a key/value form.
//
// The hook owns none of those formats — you pass `serialize` (value → clipboard
// payload) and `parse` (clipboard payload → value). See lib/delimited and
// lib/dotenv for ready-made engines to pass in.

/** What was read off the clipboard on paste, across its available flavors. */
export interface ClipboardReadPayload {
  /** `text/plain`, or "" if absent. */
  readonly text: string
  /** `text/html`, if the source offered a rich flavor (spreadsheets do). */
  readonly html: string | undefined
  /** Any files on the clipboard (pasted images, etc). */
  readonly files: File[]
  /** Read an arbitrary MIME flavor, if present. */
  readonly getType: (mediaType: string) => string | undefined
}

/** What to write to the clipboard on copy. A bare string writes `text/plain`;
 *  the object form can additionally attach a rich `text/html` flavor so a paste
 *  target that prefers HTML (a spreadsheet, a doc) gets a table instead of raw
 *  text. */
export type ClipboardWritePayload =
  | string
  | { readonly text: string; readonly html?: string }

export interface UseClipboardOptions<TValue> {
  /** Turn a value into what gets written on `copy`. */
  readonly serialize?: (value: TValue) => ClipboardWritePayload
  /** Turn a paste payload into a value; return `undefined` to ignore this paste
   *  (letting the default paste behavior proceed). */
  readonly parse?: (payload: ClipboardReadPayload) => TValue | undefined
  /** Called with a successfully-parsed pasted value. */
  readonly onPaste?: (value: TValue, payload: ClipboardReadPayload) => void
  /** How long `copied` stays true after a copy, in ms. Defaults to 1500. */
  readonly copiedResetMs?: number
}

export interface UseClipboardResult<TValue> {
  /** Serialize (if `serialize` given) and write to the clipboard. Accepts a raw
   *  payload too, for callers that build it themselves. */
  readonly copy: (value: TValue | ClipboardWritePayload) => Promise<boolean>
  /** True briefly after a successful copy — for "Copied!" affordances. */
  readonly copied: boolean
  /** Attach to an element's `onPaste`. Reads the clipboard, runs `parse`, and
   *  fires `onPaste`; calls `preventDefault` only when a value is produced. */
  readonly onPaste: (event: ReactClipboardEvent) => void
}

export function useClipboard<TValue = string>(
  options: UseClipboardOptions<TValue> = {},
): UseClipboardResult<TValue> {
  const { serialize, parse, onPaste: onPasteValue, copiedResetMs = 1500 } = options

  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    async (value: TValue | ClipboardWritePayload): Promise<boolean> => {
      const payload = resolveWritePayload(value, serialize)
      const ok = await writeClipboard(payload)
      if (ok) {
        setCopied(true)
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setCopied(false), copiedResetMs)
      }
      return ok
    },
    [copiedResetMs, serialize],
  )

  const onPaste = useCallback(
    (event: ReactClipboardEvent) => {
      if (!parse) return
      const payload = readClipboardEvent(event)
      const value = parse(payload)
      if (value === undefined) return
      event.preventDefault()
      onPasteValue?.(value, payload)
    },
    [onPasteValue, parse],
  )

  return useMemo(() => ({ copy, copied, onPaste }), [copied, copy, onPaste])
}

function resolveWritePayload<TValue>(
  value: TValue | ClipboardWritePayload,
  serialize: ((value: TValue) => ClipboardWritePayload) | undefined,
): ClipboardWritePayload {
  if (serialize) return serialize(value as TValue)
  // No serializer: the value must already be a write payload (string/{text}).
  return value as ClipboardWritePayload
}

function readClipboardEvent(event: ReactClipboardEvent): ClipboardReadPayload {
  const clipboard = event.clipboardData
  const files: File[] = []
  if (clipboard) {
    for (const item of clipboard.items) {
      if (item.kind === "file") {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }
  return {
    text: clipboard?.getData("text/plain") ?? "",
    html: clipboard?.getData("text/html") || undefined,
    files,
    getType: (mediaType) => clipboard?.getData(mediaType) || undefined,
  }
}

async function writeClipboard(payload: ClipboardWritePayload): Promise<boolean> {
  const text = typeof payload === "string" ? payload : payload.text
  const html = typeof payload === "string" ? undefined : payload.html

  // Prefer the async Clipboard API with a rich HTML flavor when available and
  // an HTML payload was provided (so spreadsheets/docs get a table).
  if (
    html &&
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ])
      return true
    } catch {
      // Fall through to plain-text paths.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path.
    }
  }

  return legacyCopyText(text)
}

// Fallback for insecure contexts / older browsers where the async Clipboard API
// is unavailable.
function legacyCopyText(text: string): boolean {
  if (typeof document === "undefined") return false
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}
