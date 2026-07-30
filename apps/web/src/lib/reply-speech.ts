// Which replies may be spoken, and when. Pure — no DOM, no fetch, no React.
//
// The rule this module exists for is NO PARTIAL NARRATION: a reply is spoken
// only once the turn that produced it has completed. Speaking a streaming
// message means synthesizing a half-sentence, then either talking over it with
// the next chunk or reading the same words twice — and a listener, unlike a
// reader, cannot skim back to work out what happened. So the in-flight message
// is excluded structurally rather than by a length heuristic or a debounce.
//
// Two other exclusions live here for the same reason: the user's own messages
// (echoing them back is noise), and anything already spoken (a re-render must
// not replay the conversation).

import type { AgentMessage } from "@zigil/agent/contracts"

export interface ReplySpeechInput {
  readonly messages: readonly AgentMessage[]
  /** True while the LAST message is still being produced. The session's own
   *  streaming status is the authority on this — nothing here guesses from
   *  message content. */
  readonly isStreaming: boolean
  readonly spokenIds: ReadonlySet<string>
}

/**
 * Agent replies whose turn has finished, oldest first.
 *
 * When the session is streaming, the last message is the one being written and
 * is excluded no matter how complete it looks.
 */
export function completedAgentReplies(
  input: Pick<ReplySpeechInput, "messages" | "isStreaming">,
): readonly AgentMessage[] {
  const settled = input.isStreaming
    ? input.messages.slice(0, -1)
    : input.messages
  return settled.filter((message) => message.role === "assistant")
}

/**
 * The replies that should be spoken now, oldest first.
 *
 * Returns a list rather than one message so a caller that fell behind (two
 * turns landing in one render) speaks both in order instead of silently
 * dropping the older one.
 */
export function repliesToSpeak(
  input: ReplySpeechInput,
): readonly AgentMessage[] {
  return completedAgentReplies(input).filter(
    (message) => !input.spokenIds.has(message.id),
  )
}
