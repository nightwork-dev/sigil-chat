// Which thread the live voice session belongs to — and the promise that it
// never changes behind the user's back.
//
// SC.10 made containment authoritative in the URL, so a voice session that is
// capturing audio for thread A while the user reads thread B is a real hazard:
// the next utterance lands somewhere the user isn't looking. The fix is not to
// follow navigation — following it silently is the bug — but to keep the
// binding fixed, name it from every route, and make rebinding an explicit act.
//
// This module owns that binding as a tiny external store (subscribed with
// useSyncExternalStore, so the composer and the shell rail read one truth
// without a provider straddling the route tree) plus the pure functions that
// decide what a binding request means. Everything except the two hooks at the
// bottom is testable without React.

import { useSyncExternalStore } from "react"

export interface VoiceBoundThread {
  readonly threadId: string
  /** Canonical URL alias (agent-threads-domain `slug`) — hrefs use this. */
  readonly threadSlug: string
  readonly title: string
  /** Container slugs, when the thread is reached through a project or
   *  workspace home rather than the principal-level session route. */
  readonly projectSlug?: string
  readonly workspaceSlug?: string
}

/** The canonical slug route for a bound thread — the one action back to it. */
export function voiceBoundThreadHref(thread: VoiceBoundThread): string {
  if (thread.projectSlug && thread.workspaceSlug) {
    return `/projects/${thread.projectSlug}/workspaces/${thread.workspaceSlug}/sessions/${thread.threadSlug}`
  }
  if (thread.projectSlug) {
    return `/projects/${thread.projectSlug}/sessions/${thread.threadSlug}`
  }
  return `/sessions/${thread.threadSlug}`
}

export type VoiceBindingDecision =
  /** Nothing was live; the request binds immediately. */
  | "bind"
  /** Already bound to this exact thread; nothing to decide. */
  | "already-bound"
  /** Bound elsewhere and live. The request is parked, not applied: the user
   *  frees voice from the thread that holds it, or keeps it there. A capture
   *  in flight is never reassigned. */
  | "needs-confirmation"

export function resolveVoiceBindingRequest(
  current: VoiceBoundThread | undefined,
  requested: VoiceBoundThread,
): VoiceBindingDecision {
  if (!current) return "bind"
  return current.threadId === requested.threadId
    ? "already-bound"
    : "needs-confirmation"
}

export interface VoiceSessionSnapshot {
  /** The thread capturing this voice session, if one is live. */
  readonly bound?: VoiceBoundThread
  /** A different thread that asked for voice while `bound` was live. Held,
   *  not applied — the user resolves it. */
  readonly pendingRebind?: VoiceBoundThread
}

const EMPTY: VoiceSessionSnapshot = {}

/** The live capture's own way out, registered by whoever owns it. Modelled on
 *  `audio-focus`'s PlaybackHandle for the same reason: a surface elsewhere in
 *  the app needs to END a capture it does not own, and relabelling the
 *  binding instead would leave the microphone running under a UI that says
 *  otherwise. */
export interface VoiceCaptureHandle {
  readonly stop: () => void
}

export interface VoiceSessionStore {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => VoiceSessionSnapshot
  /** Ask for voice on a thread, registering how to stop the capture it is
   *  about to start. A `needs-confirmation` result parks the request; it
   *  never moves the binding, because a capture in flight belongs to the
   *  thread that started it and cannot be handed to another one. */
  readonly requestBinding: (
    thread: VoiceBoundThread,
    handle?: VoiceCaptureHandle,
  ) => VoiceBindingDecision
  /** End the live capture through its own owner. Freeing voice is the only
   *  thing another surface may do to a capture it does not own. */
  readonly stopBound: () => void
  /** Drop a parked request, keeping the current binding. */
  readonly dismissPendingRebind: () => void
  /** The capture ended. Only its owner may say so — passing a thread id that
   *  is not the bound one is a no-op, so a stale caller can never clear
   *  someone else's binding. */
  readonly releaseOwned: (threadId: string) => void
}

export function createVoiceSessionStore(): VoiceSessionStore {
  let snapshot: VoiceSessionSnapshot = EMPTY
  let handle: VoiceCaptureHandle | undefined
  const listeners = new Set<() => void>()

  const commit = (next: VoiceSessionSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    requestBinding(thread, captureHandle) {
      const decision = resolveVoiceBindingRequest(snapshot.bound, thread)
      if (decision === "bind") {
        handle = captureHandle
        commit({ bound: thread })
      }
      if (decision === "needs-confirmation") {
        commit({ bound: snapshot.bound, pendingRebind: thread })
      }
      return decision
    },
    stopBound() {
      if (!snapshot.bound) return
      const owner = handle
      if (!owner) {
        // No owner left to ask (its surface unmounted) — the capture is
        // already gone with it, so just clear the readout.
        handle = undefined
        commit(EMPTY)
        return
      }
      // The owner's own stop path calls releaseOwned, which clears both the
      // binding and any request parked behind it.
      owner.stop()
    },
    dismissPendingRebind() {
      if (!snapshot.pendingRebind) return
      commit({ bound: snapshot.bound })
    },
    releaseOwned(threadId) {
      if (snapshot.bound?.threadId !== threadId) return
      handle = undefined
      commit(EMPTY)
    },
  }
}

/** The app's one live-voice binding. */
export const voiceSessionStore = createVoiceSessionStore()

export function useVoiceSession(
  store: VoiceSessionStore = voiceSessionStore,
): VoiceSessionSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY)
}
