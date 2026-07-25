// Media cleanup for one STT capture.
//
// A capture opens real hardware handles — MediaStream tracks and (usually) an
// AudioContext for level metering. Browsers do not release a live microphone
// track just because a component unmounted or a promise rejected; an
// abandoned track keeps the mic indicator lit and the device held open. This
// module is the single place that promises every track is stopped and every
// context is closed, on every exit path alike: a clean stop, an error
// mid-capture, and dispose/unmount. No real browser APIs are referenced here
// — callers inject whatever implements the two narrow shapes below, which
// keeps this pure and lets tests use plain fakes.

export interface MediaTrackLike {
  readonly stop: () => void
}

export interface AudioContextLike {
  readonly close: () => void | Promise<void>
}

export interface CaptureResources {
  readonly tracks: readonly MediaTrackLike[]
  readonly audioContext?: AudioContextLike
}

export interface CaptureLifecycle {
  /** Normal end of capture. */
  readonly stop: () => void
  /** Abnormal end of capture (upload failure, device error, etc). Releases
   *  the same resources as `stop` — there is no cleanup path that leaves
   *  hardware held open. */
  readonly error: () => void
  /** Component unmount / manager teardown. */
  readonly dispose: () => void
}

/**
 * Build a lifecycle over one capture's resources. Release runs at most once
 * even if multiple exit paths fire (e.g. an error followed by unmount).
 */
export function createCaptureLifecycle(
  resources: CaptureResources,
): CaptureLifecycle {
  let released = false

  const release = (): void => {
    if (released) return
    released = true
    for (const track of resources.tracks) {
      track.stop()
    }
    resources.audioContext?.close()
  }

  return {
    stop: release,
    error: release,
    dispose: release,
  }
}
