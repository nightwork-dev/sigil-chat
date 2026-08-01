import { ToolCall } from "@workspace/ui/components/tool-call"
import {
  getToolOutputData,
  type ToolRendererProps,
} from "@workspace/ui/components/tool-renderer-registry"

interface SynthesizedSpeechOutput {
  url?: string
  mediaType?: string
  voice?: string
  text?: string
}

/**
 * Renderer for `sigil-synthesize-speech`. Once the tool has stored the audio
 * artifact, the transcript plays it from the same authenticated media URL the
 * artifacts workspace uses. Before that — approval prompt, executing, error —
 * it delegates to the generic ToolCall view so consent and status still read
 * normally, matching the generated-image renderer.
 */
export function SynthesizedSpeechRenderer(props: ToolRendererProps) {
  const output = getToolOutputData(props.part) as
    SynthesizedSpeechOutput | undefined
  if (!output?.url) return <ToolCall {...props} />
  return (
    <figure className="my-1 flex max-w-md flex-col gap-1.5">
      {/* Native controls: the platform's playback affordances are better known
          than anything drawn here, and the transcript owns no playback state. */}
      <audio className="w-full" controls preload="none" src={output.url}>
        <a href={output.url}>Download the synthesized audio</a>
      </audio>
      {output.text ? (
        <figcaption className="text-xs text-muted-foreground">
          {output.voice ? `${output.voice}: ` : ""}
          {output.text}
        </figcaption>
      ) : null}
    </figure>
  )
}
