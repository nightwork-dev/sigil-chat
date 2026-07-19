import type { ReactNode } from "react"
import { FileTextIcon, SparklesIcon } from "lucide-react"

import { ToolCall } from "@/components/agent/tool-call"
import {
  getToolOutputData,
  type ToolRendererProps,
} from "@/components/agent/tool-renderer-registry"
import { cn } from "@workspace/ui/lib/utils"

export interface DistilledArtifact {
  title: string
  question: string
  summary: string
  resolution: string
  references: string[]
  sourceArtifactId?: string
  sourceLabel?: string
}

interface DistillOutput {
  artifactId?: string
  distilled?: DistilledArtifact
}

/**
 * Custom renderer for the `sigil-distill` tool: once the tool has stored a
 * distilled artifact, render it as a designed card (question / summary /
 * resolution / references) instead of raw JSON. Until then — approval,
 * executing, or error — delegate to the generic ToolCall view so the consent
 * and status flow still works. Mobile-clean: text wraps, no fixed widths.
 */
export function DistilledArtifactCard(props: ToolRendererProps) {
  const output = getToolOutputData(props.part) as DistillOutput | undefined
  const distilled = output?.distilled
  if (!distilled || typeof distilled.title !== "string") {
    return <ToolCall {...props} />
  }
  return <DistilledCard distilled={distilled} />
}

/**
 * Presentational distilled-artifact card — reused by the chat tool renderer
 * (above) and the D4.4 Evidence Room gallery. Pure: takes a DistilledArtifact,
 * renders it. Mobile-clean (text wraps, no fixed widths), theme tokens only.
 */
export function DistilledCard({ distilled }: { distilled: DistilledArtifact }) {
  return (
    <figure className="my-1.5 overflow-hidden rounded-lg border border-border bg-card/60">
      <header className="flex items-start gap-2 border-b border-border/70 bg-muted/30 px-3.5 py-2.5">
        <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Distilled
          </p>
          <h3 className="break-words text-sm font-semibold leading-snug text-foreground">
            {distilled.title}
          </h3>
        </div>
      </header>

      <div className="space-y-3 px-3.5 py-3 text-sm leading-relaxed">
        <Field label="Question">{distilled.question}</Field>
        <Field label="Summary">{distilled.summary}</Field>
        <Field label="Resolution" emphasis>
          {distilled.resolution}
        </Field>

        {distilled.references.length > 0 ? (
          <div className="space-y-1">
            <FieldLabel>References</FieldLabel>
            <ul className="space-y-1">
              {distilled.references.map((reference, index) => (
                <li
                  key={`${index}-${reference.slice(0, 24)}`}
                  className="flex gap-1.5 text-xs text-muted-foreground"
                >
                  <span className="select-none text-muted-foreground/60">›</span>
                  <span className="min-w-0 break-words">{reference}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {distilled.sourceLabel ?? distilled.sourceArtifactId ? (
        <figcaption className="flex items-center gap-1.5 border-t border-border/70 px-3.5 py-2 text-[0.6875rem] text-muted-foreground">
          <FileTextIcon className="size-3 shrink-0" />
          <span className="truncate">
            Distilled from {distilled.sourceLabel ?? distilled.sourceArtifactId}
          </span>
        </figcaption>
      ) : null}
    </figure>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  )
}

function Field({
  label,
  emphasis,
  children,
}: {
  label: string
  emphasis?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <FieldLabel>{label}</FieldLabel>
      <p
        className={cn(
          "break-words text-foreground/90",
          emphasis && "font-medium text-foreground",
        )}
      >
        {children}
      </p>
    </div>
  )
}
