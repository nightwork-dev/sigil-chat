import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { CodeBlock } from "@workspace/ui/components/code-block"
import { cn } from "@workspace/ui/lib/utils"

// Shared by the showcase landing and the root landing — both need the same
// two-step registry setup block, so it lives here once rather than as
// duplicated JSX in each page.

const REGISTRIES_SNIPPET = `{
  "registries": {
    "@sigil": "https://ui.nightwork.dev/r/{name}.json"
  }
}`

const ADD_SNIPPET = "pnpm dlx shadcn@latest add @sigil/<name>"

function CopyBlock({ label, code, language }: { label: string; code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="relative">
        <CodeBlock code={code} language={language} className="pr-9" />
        <button
          type="button"
          onClick={handleCopy}
          title="Copy to clipboard"
          className="absolute right-1.5 top-1.5 rounded-sm p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}

export function RegistrySetup({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-lg bg-card p-4 ring-1 ring-primary/40", className)}>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground">Setup</span>
      <CopyBlock label="1. Add the registry to components.json" code={REGISTRIES_SNIPPET} language="json" />
      <CopyBlock label="2. Add a component" code={ADD_SNIPPET} />
    </div>
  )
}
