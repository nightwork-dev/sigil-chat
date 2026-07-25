// The gaze-capture runtime's shared state, as one module-level external store.
//
// Gaze capture is shell chrome, exactly like the mic and the app-global agent
// session: one camera, mounted once, read from several places (the composer's
// consent control, the shell attention fold, the agent portrait). A single
// external store — the same shape agent-attention-delivery.ts uses — lets the
// camera-owning controller publish, and those readers subscribe narrowly,
// without prop-drilling through the whole shell.
//
// What lives here is only observable state; the camera lifecycle itself lives
// in the controller. `enabled` is the user's intent (the consent toggle writes
// it); everything else is what the controller reports back.

import { useSyncExternalStore } from "react"
import type { AttentionSelection } from "@zigil/agent-react/attention"

import type { GazeCapturePhase } from "./gaze-consent-state"

interface GazeCaptureState {
  /** User intent from the consent toggle. The controller owns the camera in
   *  response to this; it is the reversible switch. */
  readonly enabled: boolean
  readonly phase: GazeCapturePhase
  /** The region under the user's gaze as an attention selection, or null. The
   *  shell folds this into the attention envelope. */
  readonly gazeSelection: AttentionSelection | null
  /** Whether the user has met the agent's gaze (portrait dwell). */
  readonly acknowledged: boolean
}

let state: GazeCaptureState = {
  enabled: false,
  phase: "off",
  gazeSelection: null,
  acknowledged: false,
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: Partial<GazeCaptureState>): void {
  const merged = { ...state, ...next }
  if (
    merged.enabled === state.enabled &&
    merged.phase === state.phase &&
    merged.gazeSelection === state.gazeSelection &&
    merged.acknowledged === state.acknowledged
  ) {
    return
  }
  state = merged
  emit()
}

// --- writes (consent toggle + controller) ---

/** The consent toggle. Turning it off is always available and immediate. */
export function setGazeCaptureEnabled(enabled: boolean): void {
  set(enabled ? { enabled } : { enabled, phase: "off", gazeSelection: null, acknowledged: false })
}

export function setGazeCapturePhase(phase: GazeCapturePhase): void {
  set({ phase })
}

/** Publish the gazed region. Ref-stable when the region is unchanged so
 *  subscribers don't re-render on identical selections. */
export function setGazeSelection(gazeSelection: AttentionSelection | null): void {
  const current = state.gazeSelection
  if (
    current?.kind === gazeSelection?.kind &&
    current?.id === gazeSelection?.id
  ) {
    return
  }
  set({ gazeSelection })
}

export function setGazeAcknowledged(acknowledged: boolean): void {
  set({ acknowledged })
}

export function resetGazeCaptureForTests(): void {
  state = { enabled: false, phase: "off", gazeSelection: null, acknowledged: false }
  emit()
}

// --- reads ---

export function getGazeCaptureEnabled(): boolean {
  return state.enabled
}

export function useGazeCaptureEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => state.enabled, () => false)
}

export function useGazeCapturePhase(): GazeCapturePhase {
  return useSyncExternalStore(subscribe, () => state.phase, () => "off")
}

export function useGazeSelection(): AttentionSelection | null {
  return useSyncExternalStore(subscribe, () => state.gazeSelection, () => null)
}

export function usePortraitAcknowledged(): boolean {
  return useSyncExternalStore(subscribe, () => state.acknowledged, () => false)
}
