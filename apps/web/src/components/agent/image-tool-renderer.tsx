import { ToolCall } from "@/components/agent/tool-call"
import {
  getToolOutputData,
  type ToolRendererProps,
} from "@/components/agent/tool-renderer-registry"

interface GeneratedImageOutput {
  url?: string
  prompt?: string
}

/**
 * Custom renderer for the `sigil-generate-image` tool: once the tool output has
 * a URL, show the generated image inline. Until then — approval prompt,
 * executing, or error — delegate to the generic ToolCall view so the consent
 * and status flow still work. Demonstrates the tool-renderer registry pattern.
 */
export function GenerateImageRenderer(props: ToolRendererProps) {
  const output = getToolOutputData(props.part) as GeneratedImageOutput | undefined
  if (!output?.url) return <ToolCall {...props} />
  return (
    <figure className="my-1 flex flex-col gap-1.5">
      <a
        className="inline-block"
        href={output.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <img
          alt={output.prompt ?? "generated image"}
          className="max-h-96 max-w-full rounded-md border border-border object-contain"
          loading="lazy"
          src={output.url}
        />
      </a>
      {output.prompt ? (
        <figcaption className="text-xs text-muted-foreground">
          {output.prompt}
        </figcaption>
      ) : null}
    </figure>
  )
}
