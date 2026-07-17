"use client"

// Block: Playlist
//
// A dense, instrument-grade track list. Each row is index-or-play-button,
// title, artist, and a mono duration; the row for `activeId` swaps its index
// for a filled state and lights on the primary signal token. Compound
// (Root/Parts) so a caller can compose the row parts (Index, Cover, Meta,
// Duration) to taste, or drop in <Playlist.Row> for the conventional layout.
//
// Selection is a callback out — <Root> holds `activeId`/`onSelect` in context
// and each Track resolves its own active state; no internal playback state,
// no store. The active row is the only place the signal token appears, so the
// highlight means exactly one thing: "this is the playing track." Optional
// small cover thumbnails (`showCovers`) turn each index cell into artwork that
// reveals a play glyph on hover/active. Everything else is chrome on semantic
// tokens.
//
// When NOT to use: a single track with full transport (reach for NowPlaying),
// or a chaptered long-form work with a progress bar (reach for Audiobook).

import { createContext, useContext, type ReactNode } from "react"
import { PlayIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export interface PlaylistTrack {
  id: string
  title: string
  artist?: string
  /** Duration in seconds — rendered as m:ss. */
  duration?: number
  /** Small cover thumbnail URL (shown when the list `showCovers`). */
  imageSrc?: string
  imageAlt?: string
}

interface PlaylistContextValue {
  activeId?: string
  playing?: boolean
  showCovers: boolean
  onSelect?: (id: string) => void
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null)
const TrackContext = createContext<{ track: PlaylistTrack; index: number } | null>(null)

function usePlaylist(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext)
  if (!ctx) throw new Error("Playlist parts must render inside <Playlist.Root>")
  return ctx
}

function useTrack(): { track: PlaylistTrack; index: number; active: boolean; playing: boolean } {
  const list = usePlaylist()
  const ctx = useContext(TrackContext)
  if (!ctx) throw new Error("Playlist track parts must render inside <Playlist.Track>")
  const active = list.activeId === ctx.track.id
  return { ...ctx, active, playing: active && !!list.playing }
}

function formatDuration(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "--:--"
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function Root({
  activeId,
  playing,
  showCovers = false,
  onSelect,
  children,
  className,
}: {
  activeId?: string
  playing?: boolean
  showCovers?: boolean
  onSelect?: (id: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <PlaylistContext.Provider value={{ activeId, playing, showCovers, onSelect }}>
      <ul data-slot="playlist" className={cn("divide-y divide-border/50 overflow-hidden rounded-lg border border-border bg-card/30", className)}>
        {children}
      </ul>
    </PlaylistContext.Provider>
  )
}

/** Row container — provides the track via context; clicking selects it. */
function Track({ track, index, children, className }: { track: PlaylistTrack; index: number; children: ReactNode; className?: string }) {
  const { activeId, onSelect } = usePlaylist()
  const active = activeId === track.id
  return (
    <TrackContext.Provider value={{ track, index }}>
      <li data-slot="playlist-track">
        <button
          type="button"
          onClick={() => onSelect?.(track.id)}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex w-full items-center gap-3 px-2.5 py-1.5 text-left transition-colors",
            active ? "bg-primary/10" : "hover:bg-muted/40",
            className
          )}
        >
          {children}
        </button>
      </li>
    </TrackContext.Provider>
  )
}

/** Index number, or a play/pause glyph on hover / when active. With covers, the artwork backs the glyph. */
function Index({ className }: { className?: string }) {
  const { showCovers } = usePlaylist()
  const { track, index, active, playing } = useTrack()

  return (
    <span
      data-slot="playlist-index"
      className={cn(
        "group/idx relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md",
        showCovers ? "border border-border/60 bg-muted/40" : "",
        className
      )}
    >
      {showCovers && track.imageSrc && (
        <img src={track.imageSrc} alt={track.imageAlt ?? track.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Number: shown when not active and (with covers) not hovered. */}
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          showCovers ? "absolute inset-0 grid place-items-center bg-background/55 text-foreground" : "text-muted-foreground",
          active ? "opacity-0" : "opacity-100 group-hover/idx:opacity-0"
        )}
      >
        {index + 1}
      </span>
      {/* Glyph: shown when active, or on hover. */}
      <span
        className={cn(
          "absolute inset-0 grid place-items-center transition-opacity",
          showCovers ? "bg-background/55" : "",
          active ? "text-primary opacity-100" : "text-foreground opacity-0 group-hover/idx:opacity-100"
        )}
      >
        {active && playing ? (
          // The now-playing track shows a status equalizer, not a pause
          // button — the row selects (onSelect), it doesn't transport-control,
          // so a "pause" glyph would imply an action the list doesn't perform.
          <span aria-hidden className="flex h-3.5 items-end gap-[2px]">
            {[0, 140, 280].map((delay) => (
              <span key={delay} className="h-full w-[2px] rounded-full bg-primary animate-equalize" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
        ) : (
          <PlayIcon className="ml-0.5 size-3.5" />
        )}
      </span>
    </span>
  )
}

function Meta({ className }: { className?: string }) {
  const { track, active } = useTrack()
  return (
    <span data-slot="playlist-meta" className={cn("min-w-0 flex-1", className)}>
      <span className={cn("block truncate text-sm", active ? "font-medium text-primary" : "text-foreground")}>{track.title}</span>
      {track.artist && <span className="block truncate text-xs text-muted-foreground">{track.artist}</span>}
    </span>
  )
}

function Duration({ className }: { className?: string }) {
  const { track } = useTrack()
  return (
    <span data-slot="playlist-duration" className={cn("shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground", className)}>
      {formatDuration(track.duration)}
    </span>
  )
}

/** The conventional row: index/glyph, meta, duration. */
function Row({ track, index, className }: { track: PlaylistTrack; index: number; className?: string }) {
  return (
    <Track track={track} index={index} className={className}>
      <Index />
      <Meta />
      <Duration />
    </Track>
  )
}

export const Playlist = { Root, Track, Index, Meta, Duration, Row }
