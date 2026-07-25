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
