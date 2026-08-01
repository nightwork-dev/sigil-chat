// The "speak replies" preference's browser-local mirror.
//
// The preference lives in the user-settings registry as `agent.speakReplies`
// — see ./agent-preferences for the hook that reads it. This file only holds
// the copy the composer can read before that query resolves, written from the
// query layer and never from a component.
//
// Default is OFF. A page that starts talking on load is a page nobody asked to
// talk, so anything that is not an explicit "on" is off.

const STORAGE_KEY = "sigil-chat:speak-replies"

let cached: boolean | undefined

export function readSpeakRepliesMirror(): boolean {
  if (typeof window === "undefined") return false
  if (cached === undefined) {
    cached = window.localStorage.getItem(STORAGE_KEY) === "on"
  }
  return cached
}

export function writeSpeakRepliesMirror(enabled: boolean): void {
  cached = enabled
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off")
  }
}
