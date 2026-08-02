// @vitest-environment jsdom
//
// US-006 AC5/AC6: a finished dictation lands in the composer as an editable
// draft and never sends by itself, and a transcription failure degrades to
// text — the composer keeps working exactly as if voice did not exist.
//
// The recorder and the transcription call are both injected, so the real
// capture flow (permission → listening → transcribing → outcome) runs end to
// end here without touching getUserMedia.

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { ChatInput } from "@workspace/chat/components/chat-input"

import {
  appendDictationDraft,
  createVoiceSessionStore,
  type VoiceRecorder,
  type VoiceSessionStore,
} from "@zigil/agent/voice"

import { ComposerVoiceControl } from "./voice-composer-control"
import { VoiceBoundThread } from "./voice-bound-thread"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement | null = null
let root: Root | null = null

function render(element: React.ReactElement): HTMLElement {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(element))
  return host
}

/** For the one case that also mounts the shell readout, which links. */
async function renderWithRouter(
  element: React.ReactElement,
): Promise<HTMLElement> {
  const rootRoute = createRootRoute({ component: () => element })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await act(async () => {
    await router.load()
  })
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
})

/** A recorder that never touches hardware: start/stop resolve immediately. */
function fakeRecorder(audio: Blob | undefined = new Blob(["audio"])): {
  recorder: VoiceRecorder
  cancelled: () => number
} {
  let cancels = 0
  return {
    recorder: {
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(audio),
      cancel: () => {
        cancels += 1
      },
    },
    cancelled: () => cancels,
  }
}

const THREAD = {
  threadId: "thread-1",
  threadSlug: "ab12cd34",
  title: "Pricing review",
}

function Composer({
  onSend,
  voiceFirst,
  transcribe,
  createRecorder,
  store,
}: {
  onSend: () => void
  voiceFirst?: boolean
  transcribe: (audio: Blob) => Promise<string | undefined>
  createRecorder: () => VoiceRecorder
  store?: VoiceSessionStore
}) {
  const [value, setValue] = useState("")
  const [ownStore] = useState(createVoiceSessionStore)
  return (
    <ChatInput
      onChange={setValue}
      onSend={onSend}
      trailingControls={
        <ComposerVoiceControl
          createRecorder={createRecorder}
          onDraft={(text) =>
            setValue((current) => appendDictationDraft(current, text))
          }
          onSend={() => onSend()}
          store={store ?? ownStore}
          thread={THREAD}
          transcribe={transcribe}
          voiceFirst={voiceFirst}
        />
      }
      value={value}
    />
  )
}

function micButton(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>("button[data-voice-state]")
  if (!button) throw new Error("mic control did not render")
  return button
}

function textarea(el: HTMLElement): HTMLTextAreaElement {
  const field = el.querySelector("textarea")
  if (!field) throw new Error("composer textarea did not render")
  return field
}

async function dictate(el: HTMLElement): Promise<void> {
  await act(async () => {
    micButton(el).click()
  })
  expect(micButton(el).dataset.voiceState).toBe("listening")
  await act(async () => {
    micButton(el).click()
  })
}

describe("dictation lands as a draft", () => {
  it("puts the transcript in the composer without sending it", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={onSend}
        transcribe={() => Promise.resolve("remind me to call mom")}
      />,
    )

    await dictate(el)

    expect(textarea(el).value).toBe("remind me to call mom")
    expect(onSend).not.toHaveBeenCalled()
    expect(micButton(el).dataset.voiceState).toBe("idle")
  })

  it("appends to text the user already typed rather than replacing it", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={onSend}
        transcribe={() => Promise.resolve("and the invoice")}
      />,
    )
    const field = textarea(el)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!
      setter.call(field, "check the pricing")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await dictate(el)

    expect(textarea(el).value).toBe("check the pricing and the invoice")
    expect(onSend).not.toHaveBeenCalled()
  })

  it("auto-sends only when voice-first is explicitly opted into", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={onSend}
        transcribe={() => Promise.resolve("send it")}
        voiceFirst
      />,
    )

    await dictate(el)

    expect(onSend).toHaveBeenCalledTimes(1)
  })
})

describe("degrade to text", () => {
  it("a transcription failure leaves the composer fully usable", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={onSend}
        // transcribeAudio's real contract: undefined on any failure.
        transcribe={() => Promise.resolve(undefined)}
      />,
    )

    await dictate(el)

    expect(micButton(el).dataset.voiceState).toBe("error")
    // The composer itself is untouched: type and send still work.
    const field = textarea(el)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!
      setter.call(field, "typed instead")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(textarea(el).value).toBe("typed instead")
    const send = el.querySelector<HTMLButtonElement>(
      "button[aria-label='Send message']",
    )!
    act(() => send.click())
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("a refused microphone shows the error state and sends nothing", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => ({
          start: () => Promise.reject(new Error("NotAllowedError")),
          stop: () => Promise.resolve(undefined),
          cancel: () => {},
        })}
        onSend={onSend}
        transcribe={() => Promise.resolve("never reached")}
      />,
    )

    await act(async () => {
      micButton(el).click()
    })

    expect(micButton(el).dataset.voiceState).toBe("error")
    expect(textarea(el).value).toBe("")
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe("binding", () => {
  it("holds the thread while capturing and releases it when done", async () => {
    const store = createVoiceSessionStore()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={vi.fn()}
        store={store}
        transcribe={() => Promise.resolve("bound while live")}
      />,
    )

    await act(async () => {
      micButton(el).click()
    })
    expect(store.getSnapshot().bound?.threadId).toBe(THREAD.threadId)

    await act(async () => {
      micButton(el).click()
    })
    expect(store.getSnapshot().bound).toBeUndefined()
  })

  it("does not start, or steal the binding, while another thread holds voice", async () => {
    const store = createVoiceSessionStore()
    store.requestBinding({
      threadId: "other-thread",
      threadSlug: "zz99yy88",
      title: "Roadmap sync",
    })
    const transcribe = vi.fn(() => Promise.resolve("should never run"))
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={vi.fn()}
        store={store}
        transcribe={transcribe}
      />,
    )

    await act(async () => {
      micButton(el).click()
    })

    // Nothing captured here, and the live binding stayed where it was — the
    // request is parked for the user to resolve.
    expect(micButton(el).dataset.voiceState).toBe("idle")
    expect(store.getSnapshot().bound?.threadId).toBe("other-thread")
    expect(store.getSnapshot().pendingRebind?.threadId).toBe(THREAD.threadId)
    expect(transcribe).not.toHaveBeenCalled()
  })
})

describe("stopping from the shell readout", () => {
  it("really ends the capture the readout names, from another surface", async () => {
    const store = createVoiceSessionStore()
    const fake = fakeRecorder()
    // The composer and the shell readout side by side over one store, which
    // is the arrangement the app has: the readout is in the top rail, the
    // capture is owned by the composer.
    const el = await renderWithRouter(
      <>
        <Composer
          createRecorder={() => fake.recorder}
          onSend={vi.fn()}
          store={store}
          transcribe={() => Promise.resolve("stopped from the rail")}
        />
        <VoiceBoundThread store={store} />
      </>,
    )

    await act(async () => {
      micButton(el).click()
    })
    expect(micButton(el).dataset.voiceState).toBe("listening")
    expect(store.getSnapshot().bound?.threadId).toBe(THREAD.threadId)

    const stopButton = [...el.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Stop voice",
    )!
    await act(async () => {
      stopButton.click()
    })

    // The microphone is actually released and the binding is gone — the
    // readout did not merely relabel itself.
    expect(micButton(el).dataset.voiceState).toBe("idle")
    expect(store.getSnapshot().bound).toBeUndefined()
    expect(textarea(el).value).toBe("stopped from the rail")
  })
})

describe("capture release", () => {
  it("unmounting while listening releases the recorder and drafts nothing", async () => {
    const onSend = vi.fn()
    const transcribe = vi.fn(() => Promise.resolve("should not appear"))
    const fake = fakeRecorder()
    const el = render(
      <Composer
        createRecorder={() => fake.recorder}
        onSend={onSend}
        transcribe={transcribe}
      />,
    )

    await act(async () => {
      micButton(el).click()
    })
    // Leaving mid-capture must free the device rather than finish the
    // utterance behind the user's back.
    expect(micButton(el).dataset.voiceState).toBe("listening")
    expect(textarea(el).value).toBe("")

    act(() => root!.unmount())
    root = null

    expect(fake.cancelled()).toBeGreaterThan(0)
    expect(transcribe).not.toHaveBeenCalled()
  })

  it("stopping while listening finishes the utterance instead of discarding it", async () => {
    const onSend = vi.fn()
    const el = render(
      <Composer
        createRecorder={() => fakeRecorder().recorder}
        onSend={onSend}
        transcribe={() => Promise.resolve("finish this")}
      />,
    )

    await dictate(el)

    expect(textarea(el).value).toBe("finish this")
  })
})
