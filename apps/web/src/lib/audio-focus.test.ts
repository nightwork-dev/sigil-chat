import { describe, expect, it, vi } from "vitest"

import { createAudioFocusManager, type PlaybackHandle } from "./audio-focus"

describe("createAudioFocusManager", () => {
  it("pauses registered playback when capture starts", () => {
    const manager = createAudioFocusManager()
    const pause = vi.fn()
    const handle: PlaybackHandle = { pause }

    manager.registerPlayback(handle)
    manager.startCapture()

    expect(pause).toHaveBeenCalledTimes(1)
  })

  it("does nothing when no playback is registered", () => {
    const manager = createAudioFocusManager()
    expect(() => manager.startCapture()).not.toThrow()
    expect(manager.isCapturing()).toBe(true)
  })

  // Falsifiable invariant: capture and playback are never both active.
  it("never reports both capture and playback active", () => {
    const manager = createAudioFocusManager()
    const handle: PlaybackHandle = { pause: vi.fn() }
    manager.registerPlayback(handle)

    manager.startCapture()
    manager.notifyPlaybackStarted()

    expect(manager.isCapturing() && manager.isPlaying()).toBe(false)
    expect(manager.isCapturing()).toBe(true)
    expect(manager.isPlaying()).toBe(false)
  })

  it("allows playback again once capture stops", () => {
    const manager = createAudioFocusManager()
    manager.registerPlayback({ pause: vi.fn() })

    manager.startCapture()
    manager.stopCapture()
    manager.notifyPlaybackStarted()

    expect(manager.isCapturing()).toBe(false)
    expect(manager.isPlaying()).toBe(true)
  })

  it("clears playing state when playback stops", () => {
    const manager = createAudioFocusManager()
    manager.registerPlayback({ pause: vi.fn() })
    manager.notifyPlaybackStarted()

    manager.notifyPlaybackStopped()

    expect(manager.isPlaying()).toBe(false)
  })
})

// The arbiter for "never both audio paths at once": a live call and a voice
// conversation are two agents on one microphone and one pair of speakers.
describe("exclusive voice mode", () => {
  it("refuses the second mode while the first holds it, in both directions", () => {
    const first = createAudioFocusManager()
    expect(first.claimMode("live-call")).toBe(true)
    expect(first.claimMode("voice-conversation")).toBe(false)
    expect(first.modeOwner()).toBe("live-call")

    const second = createAudioFocusManager()
    expect(second.claimMode("voice-conversation")).toBe(true)
    expect(second.claimMode("live-call")).toBe(false)
    expect(second.modeOwner()).toBe("voice-conversation")
  })

  it("lets the holder re-claim its own mode", () => {
    const manager = createAudioFocusManager()
    manager.claimMode("voice-conversation")
    expect(manager.claimMode("voice-conversation")).toBe(true)
  })

  it("hands the channel over once the holder releases it", () => {
    const manager = createAudioFocusManager()
    manager.claimMode("live-call")
    manager.releaseMode("live-call")

    expect(manager.modeOwner()).toBeUndefined()
    expect(manager.claimMode("voice-conversation")).toBe(true)
  })

  // An unmounting component must not be able to free a mode it never held —
  // that would let a stale cleanup hand away a live call's channel.
  it("ignores a release from a non-owner", () => {
    const manager = createAudioFocusManager()
    manager.claimMode("live-call")

    manager.releaseMode("voice-conversation")

    expect(manager.modeOwner()).toBe("live-call")
  })
})
