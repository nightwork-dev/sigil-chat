// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import type { AgentToolCallPart } from "@zigil/agent/contracts"

import { SynthesizedSpeechRenderer } from "./speech-artifact-player"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLElement | undefined
let root: Root | undefined

function render(part: AgentToolCallPart) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <SynthesizedSpeechRenderer
        canRespond={false}
        onInputResponses={() => {}}
        part={part}
      />,
    )
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function speechPart(output: unknown, state = "output-available"): AgentToolCallPart {
  return {
    type: "tool-call",
    toolCallId: "call-1",
    name: "sigil-synthesize-speech",
    state,
    input: { text: "The tide came in sideways." },
    ...(output === undefined ? {} : { output }),
  } as unknown as AgentToolCallPart
}

const url =
  "/api/media/artifact?key=uploads%2Fabc.mp3&scope=session%3Athread-1"

describe("SynthesizedSpeechRenderer", () => {
  it("plays the stored audio artifact from its authenticated media URL", () => {
    const view = render(
      speechPart({
        structuredContent: {
          url,
          mediaType: "audio/mpeg",
          voice: "am_michael",
          text: "The tide came in sideways.",
        },
      }),
    )

    const audio = view.querySelector("audio")
    expect(audio).not.toBeNull()
    expect(audio?.hasAttribute("controls")).toBe(true)
    expect(audio?.getAttribute("src")).toBe(url)
    expect(view.textContent).toContain("am_michael")
    expect(view.textContent).toContain("The tide came in sideways.")
  })

  it("falls back to the generic tool view while there is no audio yet", () => {
    const view = render(speechPart(undefined, "input-available"))

    expect(view.querySelector("audio")).toBeNull()
    // The generic ToolCall view still names the call, so approval and status
    // read normally before the artifact exists.
    expect(view.textContent).toContain("synthesize")
  })
})
