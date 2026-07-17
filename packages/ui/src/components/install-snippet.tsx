"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

interface InstallSnippetProps {
  name: string
  className?: string
}

// Namespaced @sigil/<name> form, not the raw {origin}/r/{name}.json URL —
// our items carry @sigil/* registryDependencies that only resolve via the
// registries mapping (see the showcase's "Using this registry" note), so
// the snippet reinforces that flow rather than a URL form that would
// install the root item and then fail on its deps.
function InstallSnippet({ name, className }: InstallSnippetProps) {
  const [copied, setCopied] = useState(false)
  const command = `pnpm dlx shadcn@latest add @sigil/${name}`
  // The visible label shows only "add @sigil/<name>" — the "pnpm dlx
  // shadcn@latest" prefix is constant across every snippet on the page and
  // never the part worth reading in a cramped header row. Always rendering
  // the short form (rather than measuring available width with a
  // ResizeObserver to decide) keeps this deterministic across every host
  // context — ExhibitCard header, Swatch card, whatever's next — without
  // extra layout machinery. The full command is still what gets copied.
  const label = `add @sigil/${name}`

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      data-slot="install-snippet"
      onClick={handleCopy}
      title={command}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
        copied && "text-primary hover:text-primary",
        className,
      )}
    >
      {copied ? <CheckIcon className="size-3 shrink-0" /> : <CopyIcon className="size-3 shrink-0" />}
      <span className="truncate">{copied ? "copied" : label}</span>
    </button>
  )
}

export { InstallSnippet }
export type { InstallSnippetProps }
