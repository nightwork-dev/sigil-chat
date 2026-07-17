// DSP correctness proof for the spectrogram hook. Pure functions only — no
// React, no Web Audio. The load-bearing assertion: a synthesized pure sine
// must peak in the FFT bin nearest its frequency, proving the FFT is a real
// transform and not a decorative field.

import { describe, expect, it } from "vitest"

import {
  computeSpectrogramColumns,
  fftRadix2,
  magnitudeSpectrum,
} from "./use-audio-spectrogram"

function sine(freq: number, sampleRate: number, length: number): Float64Array {
  const out = new Float64Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate)
  return out
}

describe("fftRadix2", () => {
  it("rejects non-power-of-two lengths", () => {
    expect(() => fftRadix2(new Float64Array(3), new Float64Array(3))).toThrow()
  })

  it("computes the DFT of a known impulse (flat spectrum)", () => {
    // Delta at n=0 → all bins have magnitude 1.
    const re = new Float64Array(8)
    const im = new Float64Array(8)
    re[0] = 1
    fftRadix2(re, im)
    for (let k = 0; k < 8; k++) expect(Math.hypot(re[k]!, im[k]!)).toBeCloseTo(1, 10)
  })
})

describe("magnitudeSpectrum — pure sine peak", () => {
  it("peaks in the bin nearest 440 Hz at 8000 Hz sample rate, N=1024", () => {
    const sampleRate = 8000
    const n = 1024
    const freq = 440
    const mag = magnitudeSpectrum(sine(freq, sampleRate, n))

    let peakBin = 0
    let peakVal = -Infinity
    for (let k = 0; k < mag.length; k++) {
      if (mag[k]! > peakVal) {
        peakVal = mag[k]!
        peakBin = k
      }
    }

    const expectedBin = Math.round((freq * n) / sampleRate) // = 56
    expect(expectedBin).toBe(56)
    expect(peakBin).toBe(expectedBin)
  })
})

describe("computeSpectrogramColumns — shape + energy placement", () => {
  it("returns columns[t][b] with the requested dimensions in 0..1", () => {
    const pcm = new Float32Array(sine(220, 8000, 8000)) // 1s tone
    const cols = computeSpectrogramColumns(pcm, 32, 24)
    expect(cols.length).toBe(32)
    for (const col of cols) {
      expect(col.length).toBe(24)
      for (const v of col) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it("places a low tone's energy in the lower frequency bands", () => {
    const pcm = new Float32Array(sine(180, 8000, 8000))
    const cols = computeSpectrogramColumns(pcm, 16, 24)
    // Average each band across time.
    const bands = cols[0]!.map((_, b) => cols.reduce((s, c) => s + c[b]!, 0) / cols.length)
    let peakBand = 0
    for (let b = 1; b < bands.length; b++) if (bands[b]! > bands[peakBand]!) peakBand = b
    // 180 Hz on a log axis from ~15 Hz to 4000 Hz sits well below the midpoint.
    expect(peakBand).toBeLessThan(bands.length / 2)
  })
})
