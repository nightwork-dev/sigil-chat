// Deterministic PRNG (mulberry32) — used instead of Math.random() anywhere
// the output is generated during render. Math.random() in render produces
// different values on the server than on the client's first render (an SSR
// hydration mismatch), and reshuffles on every re-render besides. A fixed
// seed makes the sequence identical every time, so server and client agree
// without needing to hide anything until after mount.

/** Returns a function that produces a deterministic sequence of numbers in [0, 1) for a given seed. */
export function createSeededRandom(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
