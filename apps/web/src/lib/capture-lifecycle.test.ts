import { describe, expect, it, vi } from "vitest"

import {
  createCaptureLifecycle,
  type AudioContextLike,
  type MediaTrackLike,
} from "./capture-lifecycle"

function fakeResources() {
  const tracks: MediaTrackLike[] = [
    { stop: vi.fn() },
    { stop: vi.fn() },
    { stop: vi.fn() },
  ]
  const audioContext: AudioContextLike = { close: vi.fn() }
  return { tracks, audioContext }
}

describe("createCaptureLifecycle", () => {
  it("stops every track and closes the audio context on stop()", () => {
    const { tracks, audioContext } = fakeResources()
    const lifecycle = createCaptureLifecycle({ tracks, audioContext })

    lifecycle.stop()

    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
    expect(audioContext.close).toHaveBeenCalledTimes(1)
  })

  it("stops every track and closes the audio context on error()", () => {
    const { tracks, audioContext } = fakeResources()
    const lifecycle = createCaptureLifecycle({ tracks, audioContext })

    lifecycle.error()

    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
    expect(audioContext.close).toHaveBeenCalledTimes(1)
  })

  it("stops every track and closes the audio context on dispose()", () => {
    const { tracks, audioContext } = fakeResources()
    const lifecycle = createCaptureLifecycle({ tracks, audioContext })

    lifecycle.dispose()

    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
    expect(audioContext.close).toHaveBeenCalledTimes(1)
  })

  it("releases resources only once across multiple exit calls", () => {
    const { tracks, audioContext } = fakeResources()
    const lifecycle = createCaptureLifecycle({ tracks, audioContext })

    lifecycle.error()
    lifecycle.dispose()
    lifecycle.stop()

    expect(tracks[0]!.stop).toHaveBeenCalledTimes(1)
    expect(audioContext.close).toHaveBeenCalledTimes(1)
  })

  it("works without an audio context", () => {
    const tracks: MediaTrackLike[] = [{ stop: vi.fn() }]
    const lifecycle = createCaptureLifecycle({ tracks })

    expect(() => lifecycle.stop()).not.toThrow()
    expect(tracks[0]!.stop).toHaveBeenCalledTimes(1)
  })
})
