"use client"

// Not ported — a single cohesive editing widget (format-switch buttons +
// textarea + inline error), not a compound: there's no second composition
// of "one format-switching text editor" the way Argument/Curve/
// CommandAction had, so Root/Parts would be unwarranted structure with
// nothing to justify it. Fully controlled: `value`/`format` +
// `onValueChange`/`onFormatChange` from the parent.

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { CopyIcon, DownloadIcon, CheckIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { parseData, convertFormat, DATA_FORMAT_OPTIONS, type DataFormat } from "@workspace/ui/lib/data-format"

const FORMAT_EXTENSION: Record<DataFormat, string> = { json: "json", json5: "json5", yaml: "yaml" }

interface DataFormatEditorProps {
  value: string
  format: DataFormat
  onValueChange: (value: string) => void
  onFormatChange: (format: DataFormat) => void
  className?: string
  rows?: number
}

function DataFormatEditor({ value, format, onValueChange, onFormatChange, className, rows = 12 }: DataFormatEditorProps) {
  const [copied, setCopied] = useState(false)
  const parsed = parseData(value, format)

  function handleFormatChange(next: DataFormat) {
    if (next === format) return
    const converted = convertFormat(value, format, next)
    onFormatChange(next)
    // Only carry the converted text over if the current text actually
    // parsed in the old format — otherwise switching format would
    // silently discard whatever invalid/mid-edit text the user had.
    if (!converted.error) onValueChange(converted.text)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([value], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `data.${FORMAT_EXTENSION[format]}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-slot="data-format-editor" className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {DATA_FORMAT_OPTIONS.map((opt) => (
            <Button key={opt.value} size="sm" variant={format === opt.value ? "default" : "outline"} onClick={() => handleFormatChange(opt.value)}>
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={handleCopy} title="Copy">
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={handleDownload} title="Download">
            <DownloadIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className={cn("font-mono text-xs", parsed.error && "border-destructive")}
      />
      {parsed.error && <p className="text-xs text-destructive">{parsed.error}</p>}
    </div>
  )
}

export { DataFormatEditor }
export type { DataFormatEditorProps }
