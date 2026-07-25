import { describe, expect, it } from "vitest"

import { createAudioFocusManager } from "./audio-focus"
import {
  createSpeechPlayer,
  type SpeechPlaybackDriver,
} from "./speech-playback"

/** A driver whose playback ends only when the test says so — which is what
 *  makes "two at once" observable rather than a race. */
function controllableDriver() {
  const started: string[] = []
  const live = new Map<string, () => void>()
  let stopped = 0

  function createDriver(audio: Blob): SpeechPlaybackDriver {
    const name = (audio as Blob & { name?: string }).name ?? String(audio.size)
    let finish: (() => void) | undefined
    let done = false
    return {
      play: () =>
        new Promise<void>((resolve) => {
          started.push(name)
          finish = () => {
            if (done) return
            done = true
            live.delete(name)
            resolve()
          }
          live.set(name, finish)
        }),
      stop: () => {
        stopped += 1
        finish?.()
      },
    }
  }

  return {
    createDriver,
    started: () => started,
    liveCount: () => live.size,
    end: (name: string) => live.get(name)?.(),
    stopped: () => stopped,
  }
}

function utterance(name: string): Blob {
  const blob = new Blob([name]) as Blob & { name?: string }
  blob.name = name
  return blob
}

describe("one utterance at a time", () => {
  it("stops the utterance in flight before starting the next", async () => {
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: createAudioFocusManager(),
      createDriver: driver.createDriver,
    })

    const first = player.play(utterance("first"))
    expect(driver.liveCount()).toBe(1)

    const second = player.play(utterance("second"))
    // The first driver was stopped, not left running underneath.
    expect(driver.stopped()).toBe(1)
    expect(driver.liveCount()).toBe(1)
    expect(driver.started()).toEqual(["first", "second"])

    await first
    driver.end("second")
    await second
    expect(player.isPlaying()).toBe(false)
  })

  it("reports playing only while an utterance is live", async () => {
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: createAudioFocusManager(),
      createDriver: driver.createDriver,
    })

    const playing = player.play(utterance("one"))
    expect(player.isPlaying()).toBe(true)
    driver.end("one")
    await playing
    expect(player.isPlaying()).toBe(false)
  })
})

describe("the microphone wins", () => {
  it("pauses playback when dictation claims capture", async () => {
    const focus = createAudioFocusManager()
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    })

    const playing = player.play(utterance("reply"))
    expect(focus.isPlaying()).toBe(true)

    // Exactly what useVoiceDictation does on start.
    focus.startCapture()

    expect(driver.stopped()).toBe(1)
    expect(focus.isPlaying()).toBe(false)
    await playing
  })

  it("refuses to start while capture is live rather than queueing behind it", async () => {
    const focus = createAudioFocusManager()
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    })

    focus.startCapture()
    await player.play(utterance("never"))

    expect(driver.started()).toHaveLength(0)
    expect(player.isPlaying()).toBe(false)
  })
})

describe("never both audio paths", () => {
  it("refuses to speak while a live call owns the channel", async () => {
    const focus = createAudioFocusManager()
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    })

    expect(focus.claimMode("live-call")).toBe(true)
    await player.play(utterance("would-talk-over-the-call"))

    expect(driver.started()).toHaveLength(0)
  })

  it("speaks once the live call gives the channel back", async () => {
    const focus = createAudioFocusManager()
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    })

    focus.claimMode("live-call")
    focus.releaseMode("live-call")
    const playing = player.play(utterance("after-the-call"))

    expect(driver.started()).toEqual(["after-the-call"])
    driver.end("after-the-call")
    await playing
  })
})

describe("stopping", () => {
  it("releases the focus registration so a later capture is unblocked", async () => {
    const focus = createAudioFocusManager()
    const driver = controllableDriver()
    const player = createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    })

    const playing = player.play(utterance("stopped"))
    player.stop()

    expect(focus.isPlaying()).toBe(false)
    expect(player.isPlaying()).toBe(false)
    await playing
  })
})
