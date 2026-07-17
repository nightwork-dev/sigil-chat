"use client"

// Display: AudioPlayer
//
// A compact, self-contained audio player: a round play/pause control, a
// clickable bar-waveform scrubber, and a mono time readout. Feed it a `src`
// and it manages its own `<audio>` element, playback state, and progress via
// requestAnimationFrame. When no real `samples` are supplied it renders a
// deterministic seeded pseudo-waveform so the bars still read as "audio"
// rather than a flat placeholder. An optional [startTime, endTime] window
// scopes playback+scrubbing to a passage/chunk of a longer file.
//
// The bars ARE the data — a played bar uses `bg-primary` (the signal token),
// an unplayed bar uses `bg-muted-foreground/25`; everything else (frame,
// button, readout) is chrome on semantic tokens.
//
// Variants trim it down without forking the component: `variant="minimal"`
// drops the frame/border so it sits flush inside another surface (a card
// body, a playlist row); `showTime={false}` omits the mono readout and
// `showLabel={false}` omits the filename — used by the compound blocks
// (NowPlaying, Playlist, Audiobook) that supply their own titling/chrome.
//
// The scrubber has two visualizations, chosen by `viz` (orthogonal to the
// `variant` framing above). `viz="waveform"` (default) is the bar scrubber.
// `viz="spectrogram"` swaps the bars for a frequency×time heat-field of the
// WHOLE clip — time across x, frequency up y, magnitude as the alpha of the
// primary token over a dark field — folded into the transport so it seeks and
// tracks a playhead like the bars do. The heat is a REAL short-time Fourier
// transform of the decoded audio (via `useAudioSpectrogram`), not a seeded
// synthetic field: each column is the actual magnitude spectrum of that slice
// of the clip. It is NOT a live scrolling waterfall — the clip is fixed, so the
// whole spectrogram is painted once when analysis lands, then the moving
// playhead + a played/unplayed tint ride over it (played bright, unplayed
// dimmed, mirroring how the bars tint played vs unplayed). While decoding, or
// if decode/analysis fails, the spectrogram area shows a NEUTRAL skeleton
// placeholder — deliberately not spectral content, so nothing fake ever reads
// as measurement.
//
// (The bar-waveform scrubber, by contrast, still falls back to a seeded
// pseudo-waveform when no real `samples` are passed — that fallback is
// documented on the `samples` prop and makes no spectral-measurement claim.)
//
// When NOT to use: for a full transport with volume, seek-preview, playlist,
// or captions, reach for a real media component — this is the inline
// "listen to this one clip" affordance, not a media center.

import * as React from "react"
import { PauseIcon, PlayIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { useAudioSpectrogram } from "@workspace/ui/hooks/use-audio-spectrogram"
import { useElementWidth } from "@workspace/ui/hooks/use-element-width"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"
import { cn } from "@workspace/ui/lib/utils"

export interface AudioPlayerProps {
  src: string
  duration?: number
  label?: string
  /** Real amplitude samples (0–1) to render as bars. Omit for a seeded pseudo-waveform. */
  samples?: number[]
  barCount?: number
  size?: "sm" | "md" | "lg"
  /**
   * Framing of the transport row:
   *   • "bar"     — the default framed control (border + card fill).
   *   • "minimal" — no frame or padding, just play + waveform inline, so the
   *     player sits flush inside another surface (a card body, a table cell).
   */
  variant?: "bar" | "minimal"
  /**
   * Scrubber visualization (orthogonal to `variant`'s framing):
   *   • "waveform"    — the default bar-amplitude scrubber.
   *   • "spectrogram" — a static frequency×time heat-field of the whole clip,
   *     magnitude → alpha of the primary token, with the same click-to-seek
   *     and a playhead + played/unplayed tint riding over it.
   */
  viz?: "waveform" | "spectrogram"
  /** Frequency-bin count (vertical resolution) for `viz="spectrogram"`. Default 40. */
  binCount?: number
  /** Show the mono time readout (current / total). Default true. */
  showTime?: boolean
  /** Show the filename label above the transport. Default true (needs `label`). */
  showLabel?: boolean
  className?: string
  disabled?: boolean
  /** Optional playback window, in seconds, for contextual passage/chunk review. */
  startTime?: number
  endTime?: number
  onTimeUpdate?: (time: number) => void
}

// Target px per bar (bar + 1px gap) — the pitch the binning holds constant as
// the player widens, so bars never fatten into ovals.
const BAR_PITCH = 5

function seededWaveform(seed: string, count: number): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }

  return Array.from({ length: count }, (_, index) => {
    hash = ((hash << 13) ^ hash) | 0
    hash = ((hash >> 7) ^ hash) | 0
    hash = ((hash << 17) ^ hash) | 0
    const value = Math.abs(hash % 100) / 100
    const position = index / count
    const envelope = Math.sin(position * Math.PI) * 0.4 + 0.6
    return 0.15 + value * 0.85 * envelope
  })
}

function sampleWaveform(samples: number[], count: number): number[] {
  if (samples.length === 0) return []
  return Array.from({ length: count }, (_, index) => {
    const sample = samples[Math.floor((index / count) * samples.length)] ?? 0
    return Math.max(0.12, Math.min(1, Math.abs(sample) * 1.8 + 0.12))
  })
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.round(value))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

// Static frequency×time field for the WHOLE clip, painted from the REAL STFT
// magnitude columns (`columns[t][b]`, b=0 lowest band) returned by
// `useAudioSpectrogram`. Each column is the actual magnitude spectrum of that
// slice; brighter = more energy. Highest frequency at the top → invert the bin
// index. No seeding, no synthesis: the picture is the transform of the audio.
function SpectrogramField({
  columns,
  className,
}: {
  columns: number[][]
  className?: string
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const colors = useThemeColors()
  // Re-paint when the element is measured (mount/resize) so the field fills.
  const measuredWidth = useElementWidth(canvasRef)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window === "undefined") return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const cssWidth = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    if (cssWidth <= 0 || cssHeight <= 0) return

    const columnCount = columns.length
    const binCount = columns[0]?.length ?? 0
    if (columnCount === 0 || binCount === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cellW = cssWidth / columnCount
    const cellH = cssHeight / binCount

    // Dark field first — the primary-over-background heat.
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    ctx.fillStyle = withAlpha(colors.background, 0.55)
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    for (let c = 0; c < columnCount; c++) {
      const column = columns[c]!
      const x = c * cellW
      for (let b = 0; b < binCount; b++) {
        const mag = column[b] ?? 0
        if (mag < 0.02) continue
        // Highest frequency at the top → invert the bin index.
        const y = (binCount - 1 - b) * cellH
        // Perceptual-ish curve: quiet bins stay dark, loud ones saturate.
        ctx.fillStyle = withAlpha(colors.primary, Math.min(0.95, Math.pow(mag, 1.4) * 0.95))
        ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5)
      }
    }
  }, [columns, colors, measuredWidth])

  return (
    <canvas
      ref={canvasRef}
      data-slot="audio-player-spectrogram"
      className={cn("absolute inset-0 h-full w-full", className)}
    />
  )
}

// Neutral placeholder shown while the audio decodes (or if analysis fails) —
// deliberately NOT spectral content, so a loading/failed state never reads as
// measured data. A faint shimmer + a quiet label say "no data here yet."
function SpectrogramSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-sm bg-muted/20"
    >
      <div className="skeleton absolute inset-0 opacity-40" />
      <span className="relative font-mono text-[9px] uppercase tracking-wide text-muted-foreground/60">
        {label}
      </span>
    </div>
  )
}

export function AudioPlayer({
  src,
  duration,
  label,
  samples,
  barCount,
  size = "md",
  variant = "bar",
  viz = "waveform",
  binCount: spectrogramBinCount = 40,
  showTime = true,
  showLabel = true,
  className,
  disabled = false,
  startTime,
  endTime,
  onTimeUpdate,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const animationRef = React.useRef<number>(0)
  const [playing, setPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [metadataDuration, setMetadataDuration] = React.useState<number | null>(null)

  const resolvedDuration = duration ?? metadataDuration ?? 0
  const windowStart = Math.max(0, startTime ?? 0)
  const windowEnd = endTime && endTime > windowStart ? endTime : resolvedDuration
  const windowDuration = Math.max(0, windowEnd - windowStart)
  const progress = resolvedDuration > 0 ? Math.min(currentTime / resolvedDuration, 1) : 0
  // Bin the waveform to the RENDERED width so bars keep a consistent width as
  // the player stretches — more bars (higher resolution) when wider, rather
  // than a fixed count fattening into ovals. Width is 0 on the server and the
  // first client render (→ the size default), so hydration matches; it re-bins
  // once the ResizeObserver reports a real width.
  const waveformRef = React.useRef<HTMLDivElement>(null)
  const measuredWidth = useElementWidth(waveformRef)
  const sizeDefaultBars = size === "lg" ? 80 : size === "sm" ? 48 : 64
  const resolvedBarCount =
    barCount ?? (measuredWidth > 0 ? Math.max(24, Math.min(256, Math.round(measuredWidth / BAR_PITCH))) : sizeDefaultBars)
  const waveform = React.useMemo(() => {
    const sampled = sampleWaveform(samples ?? [], resolvedBarCount)
    return sampled.length > 0 ? sampled : seededWaveform(src || label || "audio", resolvedBarCount)
  }, [samples, resolvedBarCount, src, label])

  const updateProgress = React.useCallback(() => {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    if (endTime && audio.currentTime >= endTime) {
      audio.pause()
      setPlaying(false)
      setCurrentTime(endTime)
      onTimeUpdate?.(endTime)
      cancelAnimationFrame(animationRef.current)
      return
    }
    setCurrentTime(audio.currentTime)
    onTimeUpdate?.(audio.currentTime)
    animationRef.current = requestAnimationFrame(updateProgress)
  }, [endTime, onTimeUpdate])

  React.useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio || disabled || !src) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      cancelAnimationFrame(animationRef.current)
      return
    }

    if (startTime !== undefined && (audio.currentTime < windowStart || (endTime !== undefined && audio.currentTime >= endTime))) {
      audio.currentTime = windowStart
      setCurrentTime(windowStart)
    }

    audio
      .play()
      .then(() => {
        setPlaying(true)
        animationRef.current = requestAnimationFrame(updateProgress)
      })
      .catch(() => setPlaying(false))
  }

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || disabled || !src) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextProgress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const baseDuration = audio.duration || resolvedDuration
    const nextTime = startTime !== undefined || endTime !== undefined
      ? windowStart + nextProgress * (windowDuration || baseDuration)
      : nextProgress * baseDuration
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
    onTimeUpdate?.(nextTime)
  }

  const ended = () => {
    setPlaying(false)
    setCurrentTime(resolvedDuration)
    cancelAnimationFrame(animationRef.current)
  }

  const heightClass = size === "lg" ? "h-14" : size === "sm" ? "h-9" : "h-11"
  const buttonClass = size === "sm" ? "size-7" : "size-8"

  const minimal = variant === "minimal"
  const spectrogram = viz === "spectrogram"
  // Real STFT of the decoded audio. Only decode when actually showing the
  // spectrogram (empty src → the hook stays idle, not-ready). Server + initial
  // client render get `ready:false` → the neutral skeleton, matching hydration.
  const { columns: spectrogramColumns, ready: spectrogramReady, error: spectrogramError } =
    useAudioSpectrogram(spectrogram ? src : "", { bins: spectrogramBinCount })

  return (
    <div data-slot="audio-player" className={cn("group/audio-player", className)}>
      {showLabel && label && <p className="mb-1.5 truncate font-mono text-xs text-muted-foreground/70">{label}</p>}
      <div
        className={cn(
          "flex items-center gap-2.5",
          minimal
            ? "gap-2"
            : "rounded-lg border border-border bg-card/45 px-2.5 transition-colors hover:border-primary/35",
          heightClass
        )}
      >
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onEnded={ended}
          onLoadedMetadata={(event) => setMetadataDuration(event.currentTarget.duration)}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("shrink-0 rounded-full text-primary hover:bg-primary/10 hover:text-primary", buttonClass)}
          onClick={toggle}
          disabled={disabled || !src}
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="ml-0.5 size-4" />}
        </Button>
        <div
          ref={waveformRef}
          className={cn(
            "h-full flex-1",
            spectrogram
              ? "relative overflow-hidden rounded-sm py-2"
              : "flex items-center gap-px py-2",
            disabled || !src ? "cursor-default" : "cursor-pointer"
          )}
          onClick={seek}
          role="slider"
          aria-label="Audio position"
          aria-valuemin={0}
          aria-valuemax={Math.round(resolvedDuration)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
        >
          {spectrogram ? (
            <>
              {spectrogramReady ? (
                <SpectrogramField columns={spectrogramColumns} />
              ) : (
                <SpectrogramSkeleton label={spectrogramError ? "unavailable" : "analyzing…"} />
              )}
              {/* Dim the not-yet-played remainder so played reads brighter —
                  the spectrogram twin of the bars' primary-vs-muted tint. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 bg-background/55"
                style={{ left: `${(progress * 100).toFixed(2)}%`, right: 0 }}
              />
              {/* Faint warm wash over the played region for extra "lit" read. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 bg-primary/[0.06] mix-blend-screen"
                style={{ width: `${(progress * 100).toFixed(2)}%` }}
              />
              {/* Playhead — a thin primary seam at the current position. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-primary shadow-[0_0_4px_var(--color-primary)]"
                style={{ left: `${(progress * 100).toFixed(2)}%` }}
              />
            </>
          ) : (
            waveform.map((height, index) => {
              const isPlayed = index / Math.max(1, waveform.length - 1) <= progress
              return (
                <span
                  key={index}
                  className={cn("min-w-[2px] flex-1 rounded-full transition-colors duration-75", isPlayed ? "bg-primary" : "bg-muted-foreground/25")}
                  // Fixed precision: full-float heights can serialize a hair
                  // differently under the SSR vs browser JS engine (Math.sin ULP
                  // noise), tripping a hydration mismatch on the style attribute.
                  style={{ height: `${(height * 100).toFixed(2)}%` }}
                />
              )
            })
          )}
        </div>
        {showTime && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTime(currentTime)}
            <span className="mx-0.5 text-muted-foreground/45">/</span>
            {startTime !== undefined || endTime !== undefined ? formatTime(windowEnd) : formatTime(resolvedDuration)}
          </span>
        )}
      </div>
    </div>
  )
}
