"use client"

// "Read this one aloud" — the per-message TTS affordance.
//
// It exists separately from voice-conversation mode because the two answer
// different questions. The mode is "I am talking to Eve now"; this is "say
// that one again", reachable while reading, without changing what the next
// dictation does. It shares the one speech player, so pressing it stops
// whatever was being spoken rather than layering a second voice over it.
//
// It renders only where it can do something: a message that projects to no
// speakable text (a tool call, a reasoning trace, an approval receipt) gets no
// button at all, rather than a button that does nothing when pressed. And a
// synth failure leaves the message exactly as it was — the transcript on
// screen is the authoritative copy and this is a delivery surface over it.

import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2Icon, SquareIcon } from "lucide-react"

import type { AgentMessagePart } from "@zigil/agent/contracts"
import { cn } from "@workspace/ui/lib/utils"

import { speakMessageParts, type SpeakOutcome } from "@/lib/agent-voice"
import { speakableText, type SpeakableOptions } from "@/lib/speakable-text"
import { agentSpeechPlayer, type SpeechPlayer } from "@/lib/speech-playback"
import { useAgentPersonaSession } from "@/components/agent/agent-persona-session"

const FAILED = "Could not play that."

type SpeakFn = (
  parts: readonly AgentMessagePart[],
  options?: SpeakableOptions,
  fetchImpl?: typeof fetch,
  personaId?: string,
) => Promise<SpeakOutcome>

export interface MessageReadAloudProps {
  readonly parts: readonly AgentMessagePart[]
  readonly speak?: SpeakFn
  readonly player?: SpeechPlayer
  readonly className?: string
}

export function MessageReadAloud({
  parts,
  speak = speakMessageParts,
  player = agentSpeechPlayer,
  className,
}: MessageReadAloudProps) {
  const personaId = useAgentPersonaSession()
  const [speaking, setSpeaking] = useState(false)
  const [failed, setFailed] = useState(false)
  const mounted = useRef(true)
  const playerRef = useRef(player)
  playerRef.current = player

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const handleClick = useCallback(() => {
    if (speaking) {
      playerRef.current.stop()
      setSpeaking(false)
      return
    }
    setFailed(false)
    setSpeaking(true)
    void (async () => {
      const outcome = await speak(
        parts,
        { announceApprovals: true },
        fetch,
        personaId ?? undefined,
      )
      if (outcome.status !== "spoken") {
        // Silence, not a broken message: `speakMessageParts` never throws, and
        // the rendered text is untouched either way.
        if (!mounted.current) return
        setFailed(outcome.status === "failed")
        setSpeaking(false)
        return
      }
      await playerRef.current.play(outcome.audio)
      if (!mounted.current) return
      setSpeaking(false)
    })()
  }, [parts, personaId, speak, speaking])

  // Nothing this message could say — no control, rather than a dead one.
  if (!speakableText(parts, { announceApprovals: true })) return null

  const label = speaking
    ? "Stop reading this message"
    : failed
      ? "Could not play that — try again"
      : "Read this message aloud"

  return (
    <button
      aria-label={label}
      aria-pressed={speaking}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
        // `primary` is on/active and `muted` is resting, the same as every
        // other voice control. A failure is not destructive here — nothing
        // was lost, the words are still on screen — so it stays muted and
        // says so in the label instead of turning the row red.
        speaking
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
        className,
      )}
      data-read-aloud={speaking ? "speaking" : failed ? "failed" : "idle"}
      onClick={handleClick}
      title={failed ? FAILED : label}
      type="button"
    >
      {speaking ? (
        <SquareIcon className="size-3" />
      ) : (
        <Volume2Icon className="size-3.5" />
      )}
    </button>
  )
}
