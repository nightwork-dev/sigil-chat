"use client"

// Block: NowPlaying
//
// A "currently playing" card — album cover, track title, artist, and an
// embedded AudioPlayer for the track itself. Compound (Root/Parts) so the
// same track composes differently: a wide media-bar (cover left, meta +
// transport right), a tall poster (cover on top), or a bare meta + player
// with no art. <Root> takes the track and provides it via context; the parts
// (Cover, Title, Artist, Meta, Player) each read what they need through
// useNowPlaying(). <Bar> is the conventional horizontal composition.
//
// Everything is props-driven — pass a `track` in, get callbacks out via the
// embedded AudioPlayer. All chrome sits on semantic tokens (border-border,
// bg-card, text-muted-foreground); the cover art is the only "color", and it
// IS the data. The Player is reused, not reinvented: NowPlaying is titling +
// artwork around the existing AudioPlayer, run in `minimal`/no-label mode so
// the card owns the framing.
//
// When NOT to use: a dense list of many tracks (reach for Playlist), or a
// long-form chaptered work (reach for Audiobook).

import { createContext, useContext, type ReactNode } from "react"

import { AudioPlayer } from "@workspace/ui/components/media/audio-player"
import { cn } from "@workspace/ui/lib/utils"

export interface NowPlayingTrack {
  id: string
  title: string
  artist?: string
  /** Album/cover art URL. */
  imageSrc?: string
  imageAlt?: string
  /** Audio source for the embedded player. */
  src: string
  duration?: number
  /** Real amplitude samples (0–1) for the waveform; omit for a seeded one. */
  samples?: number[]
}

const NowPlayingContext = createContext<NowPlayingTrack | null>(null)

function useNowPlaying(): NowPlayingTrack {
  const ctx = useContext(NowPlayingContext)
  if (!ctx) throw new Error("NowPlaying parts must render inside <NowPlaying.Root>")
  return ctx
}

function Root({ track, children, className }: { track: NowPlayingTrack; children: ReactNode; className?: string }) {
  return (
    <NowPlayingContext.Provider value={track}>
      <div
        data-slot="now-playing"
        className={cn("rounded-xl border border-border bg-card/45 p-3", className)}
      >
        {children}
      </div>
    </NowPlayingContext.Provider>
  )
}

function Cover({ className }: { className?: string }) {
  const { imageSrc, imageAlt, title } = useNowPlaying()
  return (
    <div
      data-slot="now-playing-cover"
      className={cn("aspect-square shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/40", className)}
    >
      {imageSrc ? (
        <img src={imageSrc} alt={imageAlt ?? title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50">
          No art
        </div>
      )}
    </div>
  )
}

function Title({ className }: { className?: string }) {
  const { title } = useNowPlaying()
  return <p data-slot="now-playing-title" className={cn("truncate text-sm font-medium", className)}>{title}</p>
}

function Artist({ className }: { className?: string }) {
  const { artist } = useNowPlaying()
  if (!artist) return null
  return <p data-slot="now-playing-artist" className={cn("truncate text-xs text-muted-foreground", className)}>{artist}</p>
}

function Meta({ className }: { className?: string }) {
  return (
    <div data-slot="now-playing-meta" className={cn("min-w-0", className)}>
      <Title />
      <Artist />
    </div>
  )
}

function Player({ className }: { className?: string }) {
  const { src, duration, samples } = useNowPlaying()
  return (
    <AudioPlayer
      src={src}
      duration={duration}
      samples={samples}
      showLabel={false}
      className={className}
    />
  )
}

/** The conventional horizontal composition: cover left, meta + transport right. */
function Bar({ track, className }: { track: NowPlayingTrack; className?: string }) {
  return (
    <Root track={track} className={className}>
      <div className="flex items-center gap-3">
        <Cover className="size-16" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Meta />
          <Player />
        </div>
      </div>
    </Root>
  )
}

export const NowPlaying = { Root, Cover, Title, Artist, Meta, Player, Bar }
