"use client"

// The consumer of `speakMessageParts`: Eve's finished replies, spoken.
//
// This is the second half of the one-agent voice contract. The first half is
// dictation feeding the real Eve session (persona, memory, tools, approvals,
// one transcript); this half reads back what that session said. Nothing about
// the turn changes — the text transcript is still authoritative and still
// rendered, and speech is layered over it.
//
// Ordering is deliberate. Replies go into a queue and are drained one at a
// time, awaiting playback before starting the next, so overlapping voices are
// impossible at the source rather than merely corrected by the player. A
// message is marked spoken BEFORE synthesis is attempted: a synth failure must
// degrade to the text that is already on screen, and a failure that left the
// message unmarked would retry it on every subsequent render.
//
// Effects are the right tool here and not a data-fetching smell: this is media
// integration (an audio element, a shared focus manager) driven by streaming
// state, which is exactly the carve-out the repo's no-useEffect rule names.

import { useEffect, useRef } from "react"

import type { AgentMessage } from "@zigil/agent-surface/contracts"

import { speakMessageParts, type SpeakOutcome } from "./agent-voice"
import { repliesToSpeak } from "./reply-speech"
import { agentSpeechPlayer, type SpeechPlayer } from "./speech-playback"
import type { SpeakableOptions } from "./speakable-text"

type SpeakFn = (
  parts: AgentMessage["parts"],
  options?: SpeakableOptions,
  fetchImpl?: typeof fetch,
  personaId?: string,
) => Promise<SpeakOutcome>

export interface UseSpokenAgentRepliesOptions {
  /** Off by default at every call site. Turning it on speaks replies that
   *  complete FROM NOW ON — never the backlog already on screen. */
  readonly enabled: boolean
  readonly messages: readonly AgentMessage[]
  readonly isStreaming: boolean
  readonly personaId?: string
  readonly speak?: SpeakFn
  readonly player?: SpeechPlayer
}

export function useSpokenAgentReplies({
  enabled,
  messages,
  isStreaming,
  personaId,
  speak = speakMessageParts,
  player = agentSpeechPlayer,
}: UseSpokenAgentRepliesOptions): void {
  const spoken = useRef<Set<string>>(new Set())
  const queue = useRef<AgentMessage[]>([])
  const draining = useRef(false)
  // Whether this activation has taken its baseline yet. Reset on disable, so
  // turning the mode off and on again does not read the history back.
  const seeded = useRef(false)
  const speakRef = useRef(speak)
  speakRef.current = speak
  const playerRef = useRef(player)
  playerRef.current = player

  useEffect(() => {
    if (!enabled) {
      seeded.current = false
      spoken.current = new Set()
      queue.current = []
      playerRef.current.stop()
      return
    }

    if (!seeded.current) {
      // Everything already in the transcript is history, not a reply to this
      // user's next utterance. Marking it spoken is what makes turning the
      // mode on mid-conversation quiet instead of a monologue.
      seeded.current = true
      for (const message of messages) spoken.current.add(message.id)
      return
    }

    const pending = repliesToSpeak({
      messages,
      isStreaming,
      spokenIds: spoken.current,
    })
    if (pending.length === 0) return
    for (const message of pending) {
      spoken.current.add(message.id)
      queue.current.push(message)
    }

    if (draining.current) return
    draining.current = true
    void (async () => {
      try {
        while (queue.current.length > 0) {
          const next = queue.current.shift()
          if (!next) break
          // Approvals are announced ("X needs your approval") and never
          // granted — the grant stays on the card in the transcript.
          //
          // `speakMessageParts` never throws, but this catch does not rely on
          // that: one bad reply must not take the rest of the queue down with
          // it, so the failure is contained to the utterance that caused it.
          try {
            const outcome = await speakRef.current(
              next.parts,
              { announceApprovals: true },
              fetch,
              personaId,
            )
            // Anything other than `spoken` — nothing speakable, network down,
            // empty audio — is silence, and the rendered message is untouched.
            if (outcome.status === "spoken") {
              await playerRef.current.play(outcome.audio)
            }
          } catch {
            // Silence for this one reply. The text is already on screen.
          }
        }
      } finally {
        draining.current = false
      }
    })()
  }, [enabled, isStreaming, messages, personaId])
}
