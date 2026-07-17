// Self-contained synthesized audio for the AudioPlayer + ResourceGallery
// showcases — genuinely playable clips (the transport advances, the waveform
// fills) with no binary assets shipped. Built deterministically the same way on
// server and client (a portable base64 encoder, not btoa/Buffer) so every
// <audio src> is byte-identical across SSR and hydration. Each "preset" gets a
// distinct timbre (root note, waveform, arpeggio) so a pack gallery of them
// reads as a real preview library, not one repeated tone.

const SAMPLE_RATE = 8000
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function base64(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    out += BASE64_CHARS[(triple >> 18) & 0x3f]
    out += BASE64_CHARS[(triple >> 12) & 0x3f]
    out += i + 1 < bytes.length ? BASE64_CHARS[(triple >> 6) & 0x3f] : "="
    out += i + 2 < bytes.length ? BASE64_CHARS[triple & 0x3f] : "="
  }
  return out
}

type Wave = "sine" | "saw" | "square" | "triangle"

/** One oscillator sample. `phase` is in cycles (fractional part is the position). */
function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase)
  switch (wave) {
    case "sine":
      return Math.sin(p * Math.PI * 2)
    case "saw":
      return 2 * p - 1
    case "square":
      return p < 0.5 ? 1 : -1
    case "triangle":
      return 4 * Math.abs(p - 0.5) - 1
  }
}

interface SynthSpec {
  /** Root frequency in Hz. */
  root: number
  wave: Wave
  /** Semitone offsets, stepped one per beat, looped. */
  intervals: number[]
  bpm: number
  seconds: number
  /** Per-beat exponential decay — higher = pluckier. */
  decay: number
}

function synth({ root, wave, intervals, bpm, seconds, decay }: SynthSpec): string {
  const frames = SAMPLE_RATE * seconds
  const dataBytes = frames * 2 // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataBytes, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, dataBytes, true)

  const beatDur = 60 / bpm
  let phase = 0 // accumulated so pitch changes stay click-free
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE
    const step = Math.floor(t / beatDur) % intervals.length
    const freq = root * Math.pow(2, intervals[step]! / 12)
    phase += freq / SAMPLE_RATE
    const beatT = (t % beatDur) / beatDur
    const env = Math.exp(-beatT * decay) * (0.9 - 0.5 * (t / seconds)) // gentle fade-out
    const sample = osc(wave, phase) * env * 0.4
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  }

  return `data:audio/wav;base64,${base64(new Uint8Array(buffer))}`
}

export interface SynthPreset {
  id: string
  name: string
  /** Character label, e.g. "Analog · Bass". */
  kind: string
  presetCount: number
  seconds: number
  src: string
}

const SPECS: (Omit<SynthPreset, "src"> & { spec: SynthSpec })[] = [
  { id: "amber-sine", name: "Amber Sine", kind: "Analog · Keys", presetCount: 24, seconds: 4, spec: { root: 220, wave: "sine", intervals: [0, 7, 12, 7], bpm: 104, seconds: 4, decay: 2.6 } },
  { id: "copper-saw", name: "Copper Saw", kind: "Analog · Bass", presetCount: 18, seconds: 4, spec: { root: 110, wave: "saw", intervals: [0, 3, 7], bpm: 120, seconds: 4, decay: 2.0 } },
  { id: "teal-square", name: "Teal Square", kind: "Chip · Lead", presetCount: 32, seconds: 4, spec: { root: 262, wave: "square", intervals: [0, 5, 7, 10], bpm: 132, seconds: 4, decay: 3.2 } },
  { id: "glass-tri", name: "Glass Triangle", kind: "Digital · Pad", presetCount: 16, seconds: 4, spec: { root: 330, wave: "triangle", intervals: [0, 4, 7], bpm: 88, seconds: 4, decay: 1.4 } },
  { id: "dusk-pluck", name: "Dusk Pluck", kind: "Analog · Pluck", presetCount: 21, seconds: 4, spec: { root: 196, wave: "saw", intervals: [0, 12, 7, 5], bpm: 116, seconds: 4, decay: 4.0 } },
  { id: "signal-drone", name: "Signal Drone", kind: "Modular · Texture", presetCount: 12, seconds: 4, spec: { root: 147, wave: "sine", intervals: [0, 2], bpm: 60, seconds: 4, decay: 0.8 } },
]

/** Six distinct, playable preset previews for the sound-pack gallery. */
export const SYNTH_PRESETS: SynthPreset[] = SPECS.map(({ spec, ...meta }) => ({ ...meta, src: synth(spec) }))

// Back-compat single-clip exports for the standalone AudioPlayer exhibit.
export const TONE_SRC = SYNTH_PRESETS[0]!.src
export const TONE_DURATION = SYNTH_PRESETS[0]!.seconds
