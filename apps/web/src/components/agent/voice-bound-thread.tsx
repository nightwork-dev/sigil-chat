"use client"

// Where your voice is going, from wherever you happen to be standing.
//
// A live capture belongs to exactly one thread. Because containment lives in
// the URL (SC.10), the user can navigate away mid-session and lose track of
// which conversation the next utterance lands in — so while, and only while, a
// capture is live, the shell names that thread and links straight back to its
// canonical slug route. Nothing renders when nothing is live: this is a live
// readout, not a permanent chrome element.
//
// Starting dictation from a different thread does NOT move the binding, and
// this readout does not pretend it can: a capture in flight belongs to the
// thread that started it, so the two offers here are the two real ones — free
// voice from the thread holding it, or leave it there. Silently reassigning
// it, or saying it moved while the original capture kept running, would both
// be the bug.

import { Link } from "@tanstack/react-router"
import { MicIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  useVoiceSession,
  voiceBoundThreadHref,
  voiceSessionStore,
  type VoiceSessionStore,
} from "@/lib/voice-session-binding"

export function VoiceBoundThread({
  store = voiceSessionStore,
}: {
  store?: VoiceSessionStore
}) {
  const { bound, pendingRebind } = useVoiceSession(store)
  if (!bound) return null

  return (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      <Link
        className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
        data-testid="voice-bound-thread-link"
        // "Opened from", not "bound to": the server-side realtime thread is
        // not this Eve thread yet (see LIVE-VOICE-HARNESS-ASSESSMENT — P1).
        // The label must not claim a binding the backend does not have.
        title={`Voice opened from ${bound.title} — separate voice agent (experimental)`}
        to={voiceBoundThreadHref(bound)}
      >
        {/* The mic icon is the one thing that says "this readout is about
            capture" — wayfinding, not decoration; it appears only while a
            capture is live. */}
        <MicIcon aria-hidden className="size-3 shrink-0" />
        <span className="max-w-40 truncate">{bound.title}</span>
      </Link>
      {pendingRebind ? (
        <span
          className="flex min-w-0 items-center gap-1 text-muted-foreground"
          data-testid="voice-rebind-prompt"
        >
          <span className="truncate">
            Voice stayed on {bound.title}, not {pendingRebind.title}.
          </span>
          <Button onClick={() => store.stopBound()} size="xs" variant="outline">
            Stop voice
          </Button>
          <Button
            onClick={() => store.dismissPendingRebind()}
            size="xs"
            variant="ghost"
          >
            Keep
          </Button>
        </span>
      ) : (
        <Button
          className="text-muted-foreground"
          onClick={() => store.stopBound()}
          size="xs"
          variant="ghost"
        >
          Stop voice
        </Button>
      )}
    </span>
  )
}
