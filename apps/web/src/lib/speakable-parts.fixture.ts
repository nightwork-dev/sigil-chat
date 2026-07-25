// One sample of every message part kind that must NEVER be spoken, each
// carrying a marker that must not appear in synthesized text.
//
// This lives beside the code rather than inside a single test file because two
// layers assert against it: `speakable-text.test.ts` proves the projection
// excludes them, and the voice-conversation component tests prove the exclusion
// survives the whole path from a rendered message to the synth request. Adding
// a NEW part kind upstream means adding one row here, and both layers cover it.

import type { AgentMessagePart } from "@zigil/agent-surface"

export const SPEECH_LEAK_CANARY = "LEAKCANARY"

export const NON_SPEAKABLE_PARTS: ReadonlyArray<{
  readonly label: string
  readonly part: AgentMessagePart
}> = [
  {
    label: "reasoning trace",
    part: { type: "reasoning", text: `thinking about ${SPEECH_LEAK_CANARY}` },
  },
  {
    label: "tool arguments",
    part: {
      type: "tool-call",
      id: "t1",
      name: "read_file",
      state: "input-available",
      input: { path: `/etc/${SPEECH_LEAK_CANARY}` },
    },
  },
  {
    label: "tool results",
    part: {
      type: "tool-call",
      id: "t2",
      name: "read_file",
      state: "output-available",
      output: { contents: SPEECH_LEAK_CANARY },
    },
  },
  {
    label: "tool error text",
    part: {
      type: "tool-call",
      id: "t3",
      name: "read_file",
      state: "output-error",
      errorText: `failed on ${SPEECH_LEAK_CANARY}`,
    },
  },
  {
    label: "authorization receipt",
    part: {
      type: "authorization",
      id: "a1",
      state: "completed",
      displayName: "GitHub",
      description: `token ${SPEECH_LEAK_CANARY}`,
      outcome: "authorized",
      authorizationUrl: `https://example.com/${SPEECH_LEAK_CANARY}`,
    },
  },
  {
    label: "file part",
    part: {
      type: "file",
      mediaType: "text/plain",
      url: `https://x/${SPEECH_LEAK_CANARY}`,
    },
  },
]
