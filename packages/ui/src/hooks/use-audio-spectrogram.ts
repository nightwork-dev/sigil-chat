"use client"

// A REAL short-time Fourier transform of decoded audio, as a reusable hook.
//
// Given an audio `src` (URL or data URI), this decodes the clip to mono PCM in
// a shared Web-Audio context, runs a genuine radix-2 FFT over Hann-windowed
// frames, and returns a `columns[time][freq]` field of magnitudes normalized to
// 0..1 — the actual spectral content of the audio, deterministic for a given
// clip. There is no seeding and no synthesis: the same file always produces the
// same spectrogram because it IS the transform of that file.
//
// SSR-safe: on the server (or where Web Audio is unavailable) it returns an
// empty, not-ready result so the caller renders a neutral skeleton; decoding +
// analysis happen in a client effect after mount, then `ready` flips true and
// `columns` fills. That is a post-mount state change, not a hydration diff.
//
// The FFT and STFT are plain exported functions (no React, no DOM) so the DSP
// can be unit-tested directly — see use-audio-spectrogram.test.ts, which asserts
// a pure 440 Hz sine peaks in the FFT bin nearest 440 Hz.

import { useEffect, useState } from "react"

export interface UseAudioSpectrogramOptions {
  /** Number of time columns to aggregate the frames down to. Default 96. */
  columns?: number
  /** Number of frequency bins (rows) per column. Default 48. */
  bins?: number
}

export interface AudioSpectrogram {
  /** `columns[t][b]` magnitude in 0..1; b=0 is the lowest frequency band. */
  columns: number[][]
  bins: number
  ready: boolean
  error: boolean
}

// ---------------------------------------------------------------------------
// FFT — iterative in-place radix-2 Cooley–Tukey. `re`/`im` are modified in
// place and must have a power-of-two length. After it returns, bin k of the
// spectrum is (re[k], im[k]).
// ---------------------------------------------------------------------------
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if (n <= 1) return
  if ((n & (n - 1)) !== 0) throw new Error(`fftRadix2: length ${n} is not a power of two`)

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }

  // Butterflies, doubling the transform length each stage.
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k]!
        const aIm = im[i + k]!
        const bRe = re[i + k + half]!
        const bIm = im[i + k + half]!
        const tRe = bRe * wRe - bIm * wIm
        const tIm = bRe * wIm + bIm * wRe
        re[i + k] = aRe + tRe
        im[i + k] = aIm + tIm
        re[i + k + half] = aRe - tRe
        im[i + k + half] = aIm - tIm
        const nextWRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextWRe
      }
    }
  }
}

/**
 * Magnitude spectrum of one real frame: applies a Hann window, runs the FFT,
 * and returns hypot(re, im) for the first N/2 bins. Exported so tests can point
 * it at a synthesized tone and assert the peak bin. `frame.length` must be a
 * power of two.
 */
export function magnitudeSpectrum(frame: Float64Array): Float64Array {
  const n = frame.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    // Hann window — tapers frame edges so leakage doesn't smear the peak.
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    re[i] = frame[i]! * w
  }
  fftRadix2(re, im)
  const half = n >> 1
  const mag = new Float64Array(half)
  for (let k = 0; k < half; k++) mag[k] = Math.hypot(re[k]!, im[k]!)
  return mag
}

const FFT_SIZE = 1024
const HANN_GAIN = 0.5 // coherent gain of a Hann window; normalizes magnitude scale
const DB_MIN = -90
const DB_MAX = -10
const EPS = 1e-9

/**
 * Full STFT → normalized magnitude field. Frames `pcm` with a `FFT_SIZE`
 * power-of-two window at 50% hop, Hann-windows each frame, takes the magnitude
 * spectrum, converts to dB, clamps to [DB_MIN, DB_MAX] and normalizes to 0..1,
 * then aggregates the frames down to `columns` time columns and the linear
 * spectrum down to `bins` frequency bins on a LOG-frequency scale (so low,
 * audible frequencies get most of the rows instead of near-silent highs).
 * Returns `out[t][b]`, b=0 lowest band. Pure — no React, no DOM.
 */
export function computeSpectrogramColumns(pcm: Float32Array, columns: number, bins: number): number[][] {
  const n = FFT_SIZE
  const half = n >> 1
  const hop = n >> 1
  const columnCount = Math.max(1, Math.floor(columns))
  const binCount = Math.max(1, Math.floor(bins))

  const hann = new Float64Array(n)
  for (let i = 0; i < n; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))

  const frameCount = Math.max(1, Math.floor((pcm.length - n) / hop) + 1)
  const re = new Float64Array(n)
  const im = new Float64Array(n)

  // Log-frequency bin edges → FFT bin indices. Bin 0 is DC (skip); start at 1.
  const minBin = 1
  const maxBin = half
  const ratio = maxBin / minBin

  const frames: number[][] = []
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop
    for (let i = 0; i < n; i++) {
      const s = start + i < pcm.length ? pcm[start + i]! : 0
      re[i] = s * hann[i]!
      im[i] = 0
    }
    fftRadix2(re, im)

    const row = new Array<number>(binCount)
    for (let b = 0; b < binCount; b++) {
      const loF = minBin * Math.pow(ratio, b / binCount)
      const hiF = minBin * Math.pow(ratio, (b + 1) / binCount)
      const loI = Math.max(minBin, Math.floor(loF))
      const hiI = Math.min(half, Math.max(loI + 1, Math.ceil(hiF)))
      // Peak magnitude across this band reads harmonics crisply.
      let peak = 0
      for (let k = loI; k < hiI; k++) {
        const m = Math.hypot(re[k]!, im[k]!)
        if (m > peak) peak = m
      }
      // Normalize magnitude to ~0..1 (full-scale sine ≈ amplitude), then dB.
      const norm = peak / (half * HANN_GAIN)
      const db = 20 * Math.log10(norm + EPS)
      row[b] = Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)))
    }
    frames.push(row)
  }

  // Aggregate frames → `columnCount` time columns (mean over each group).
  const out: number[][] = []
  for (let c = 0; c < columnCount; c++) {
    const f0 = Math.floor((c * frameCount) / columnCount)
    const f1 = Math.max(f0 + 1, Math.floor(((c + 1) * frameCount) / columnCount))
    const acc = new Array<number>(binCount).fill(0)
    let count = 0
    for (let f = f0; f < Math.min(f1, frameCount); f++) {
      const frame = frames[f]!
      for (let b = 0; b < binCount; b++) acc[b]! += frame[b]!
      count++
    }
    if (count > 0) for (let b = 0; b < binCount; b++) acc[b]! /= count
    out.push(acc)
  }
  return out
}

// A single shared AudioContext, created lazily on first client use and reused
// for the lifetime of the page — never closed mid-use, since multiple players
// share it. Guarded so importing this module on the server is inert.
let sharedContext: AudioContext | null = null
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedContext) sharedContext = new Ctor()
  return sharedContext
}

function toMono(audio: AudioBuffer): Float32Array {
  const channels = audio.numberOfChannels
  if (channels <= 1) return audio.getChannelData(0)
  const length = audio.length
  const mono = new Float32Array(length)
  for (let ch = 0; ch < channels; ch++) {
    const data = audio.getChannelData(ch)
    for (let i = 0; i < length; i++) mono[i]! += data[i]!
  }
  for (let i = 0; i < length; i++) mono[i]! /= channels
  return mono
}

/**
 * Decode `src` and compute its real spectrogram on the client. Returns a
 * skeleton-friendly `{ columns: [], ready: false, error: false }` on the server
 * and until decode+analysis complete; `ready: true` once `columns` are filled;
 * `error: true` on decode failure.
 */
export function useAudioSpectrogram(
  src: string,
  opts: UseAudioSpectrogramOptions = {},
): AudioSpectrogram {
  const columns = opts.columns ?? 96
  const bins = opts.bins ?? 48
  const [state, setState] = useState<{ columns: number[][]; ready: boolean; error: boolean }>({
    columns: [],
    ready: false,
    error: false,
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const ctx = getSharedAudioContext()
    if (!ctx || !src) {
      setState({ columns: [], ready: false, error: !src ? false : true })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setState({ columns: [], ready: false, error: false })

    void (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal })
        const buffer = await response.arrayBuffer()
        if (cancelled) return
        // decodeAudioData detaches the ArrayBuffer; give it a copy so an aborted
        // retry can't touch a detached buffer.
        const audio = await ctx.decodeAudioData(buffer.slice(0))
        if (cancelled) return
        const pcm = toMono(audio)
        const cols = computeSpectrogramColumns(pcm, columns, bins)
        if (cancelled) return
        setState({ columns: cols, ready: true, error: false })
      } catch {
        if (cancelled) return
        setState({ columns: [], ready: false, error: true })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [src, columns, bins])

  return { columns: state.columns, bins, ready: state.ready, error: state.error }
}
