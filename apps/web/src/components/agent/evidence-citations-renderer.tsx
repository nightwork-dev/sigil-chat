import { FileTextIcon, QuoteIcon } from "lucide-react"

import { ToolCall } from "@/components/agent/tool-call"
import {
  getToolOutputData,
  type ToolRendererProps,
} from "@/components/agent/tool-renderer-registry"

// Local view of the sigil-evidence-ask output (codex's D4.2 plumbing). The web
// renderer owns what it reads from the tool result — no dependency on apps/gonk.
interface EvidenceLocator {
  startLine: number
  endLine: number
}
export interface EvidenceCitation {
  citationId: string
  artifactId: string
  filename: string
  quote: string
  locator: EvidenceLocator
}
export interface EvidenceSearchResult {
  grounding: "grounded" | "no-evidence"
  citations: EvidenceCitation[]
}

/**
 * Custom renderer for the `sigil-evidence-ask` tool: once retrieval has run,
 * show a compact Sources panel — each citation as its exact quoted passage with
 * the source file + line locator, so the agent's cited answer is verifiable.
 * Honest by construction: a no-evidence result renders "no supporting evidence"
 * rather than an empty card (the fail-closed contract). Delegates to the generic
 * ToolCall view during approval/executing. Mobile-clean: quotes wrap.
 */
export function EvidenceCitationsRenderer(props: ToolRendererProps) {
  const result = getToolOutputData(props.part) as EvidenceSearchResult | undefined
  if (!result || typeof result.grounding !== "string") {
    return <ToolCall {...props} />
  }
  return <EvidenceCitations result={result} />
}

/**
 * Presentational citations panel — reused by the chat tool renderer (above) and
 * the D4.4 Evidence Room ask region. Honest by construction: a no-evidence
 * result renders "no supporting evidence" rather than an empty panel.
 */
export function EvidenceCitations({ result }: { result: EvidenceSearchResult }) {
  if (result.grounding === "no-evidence" || result.citations.length === 0) {
    return (
      <div className="my-1.5 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">
          No supporting evidence
        </span>{" "}
        in the attached documents for this question.
      </div>
    )
  }

  return (
    <figure className="my-1.5 overflow-hidden rounded-lg border border-border bg-card/60">
      <header className="flex items-center gap-1.5 border-b border-border/70 bg-muted/30 px-3.5 py-2">
        <QuoteIcon className="size-3.5 shrink-0 text-primary" />
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Sources · {result.citations.length}
        </p>
      </header>
      <ol className="divide-y divide-border/60">
        {result.citations.map((citation) => (
          <li key={citation.citationId} className="space-y-1.5 px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <span className="rounded bg-primary/15 px-1 font-mono font-medium text-primary">
                {citation.citationId}
              </span>
              <FileTextIcon className="size-3 shrink-0" />
              <span className="min-w-0 truncate font-medium text-foreground/80">
                {citation.filename}
              </span>
              <span className="shrink-0 text-muted-foreground/70">
                lines {citation.locator.startLine}–{citation.locator.endLine}
              </span>
            </div>
            <blockquote className="border-l-2 border-primary/30 pl-2.5 text-xs leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
              {citation.quote}
            </blockquote>
          </li>
        ))}
      </ol>
    </figure>
  )
}
