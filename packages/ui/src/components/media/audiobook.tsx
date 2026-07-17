"use client"

// Block: Audiobook
//
// A long-form chaptered-audio card: cover + title + author, a chapter list
// (title + duration, current chapter lit on the signal token), an overall
// progress indicator across the whole work, and an embedded AudioPlayer
// scoped to the current chapter. Compound (Root/Parts) so the header,
// progress, chapter list, and transport can be recomposed — <Root> holds the
// book + `currentChapterId` + `onSelectChapter` in context and each part
// resolves what it needs.
//
// Props-driven: the book (cover/title/author/chapters) and current-chapter id
// come in, selection goes out via `onSelectChapter`; the embedded player emits
// its own time via `onTimeUpdate`. Overall progress is derived (useMemo) from
// cumulative chapter durations + the current position — no effect, no store.
// The signal token appears only on the active chapter and the progress fill,
// so it always means "where you are." Reuses AudioPlayer (label-less) for the
// transport rather than reinventing playback.
//
// When NOT to use: a flat music track list (reach for Playlist) or a single
// track (reach for NowPlaying).

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { CheckIcon, PauseIcon, PlayIcon } from "lucide-react"

import { AudioPlayer } from "@workspace/ui/components/media/audio-player"
import { cn } from "@workspace/ui/lib/utils"

export interface AudiobookChapter {
  id: string
  title: string
  /** Chapter length in seconds. */
  duration?: number
  /** Audio source for this chapter. */
  src: string
  /** Real amplitude samples (0–1) for the waveform; omit for a seeded one. */
  samples?: number[]
}

export interface AudiobookData {
  id: string
  title: string
  author?: string
  imageSrc?: string
  imageAlt?: string
  chapters: AudiobookChapter[]
}

interface AudiobookContextValue {
  book: AudiobookData
  currentChapterId?: string
  playing?: boolean
  /** Position within the current chapter, in seconds — feeds overall progress. */
  currentTime?: number
  onSelectChapter?: (id: string) => void
  onTimeUpdate?: (time: number) => void
}

const AudiobookContext = createContext<AudiobookContextValue | null>(null)

function useAudiobook(): AudiobookContextValue {
  const ctx = useContext(AudiobookContext)
  if (!ctx) throw new Error("Audiobook parts must render inside <Audiobook.Root>")
  return ctx
}

function formatDuration(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "--:--"
  const total = Math.max(0, Math.round(value))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function Root({
  book,
  currentChapterId,
  playing,
  currentTime,
  onSelectChapter,
  onTimeUpdate,
  children,
  className,
}: {
  book: AudiobookData
  currentChapterId?: string
  playing?: boolean
  currentTime?: number
  onSelectChapter?: (id: string) => void
  onTimeUpdate?: (time: number) => void
  children: ReactNode
  className?: string
}) {
  return (
    <AudiobookContext.Provider value={{ book, currentChapterId, playing, currentTime, onSelectChapter, onTimeUpdate }}>
      <div data-slot="audiobook" className={cn("space-y-3 rounded-xl border border-border bg-card/45 p-3", className)}>
        {children}
      </div>
    </AudiobookContext.Provider>
  )
}

function Cover({ className }: { className?: string }) {
  const { book } = useAudiobook()
  return (
    <div
      data-slot="audiobook-cover"
      className={cn("aspect-[2/3] shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/40", className)}
    >
      {book.imageSrc ? (
        <img src={book.imageSrc} alt={book.imageAlt ?? book.title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50">
          No cover
        </div>
      )}
    </div>
  )
}

function Title({ className }: { className?: string }) {
  const { book } = useAudiobook()
  return <p data-slot="audiobook-title" className={cn("text-sm font-medium leading-snug", className)}>{book.title}</p>
}

function Author({ className }: { className?: string }) {
  const { book } = useAudiobook()
  if (!book.author) return null
  return <p data-slot="audiobook-author" className={cn("text-xs text-muted-foreground", className)}>{book.author}</p>
}

/** Overall progress across the whole work — cumulative completed chapters + position in the current one. */
function Progress({ className }: { className?: string }) {
  const { book, currentChapterId, currentTime = 0 } = useAudiobook()

  const { fraction, elapsed, total } = useMemo(() => {
    const totalSeconds = book.chapters.reduce((sum, c) => sum + (c.duration ?? 0), 0)
    let before = 0
    let found = false
    for (const c of book.chapters) {
      if (c.id === currentChapterId) {
        found = true
        break
      }
      before += c.duration ?? 0
    }
    const current = found ? before + Math.max(0, currentTime) : before
    return {
      total: totalSeconds,
      elapsed: current,
      fraction: totalSeconds > 0 ? Math.min(1, current / totalSeconds) : 0,
    }
  }, [book.chapters, currentChapterId, currentTime])

  return (
    <div data-slot="audiobook-progress" className={cn("space-y-1", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${(fraction * 100).toFixed(2)}%` }} />
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{formatDuration(elapsed)}</span>
        <span>{formatDuration(total)}</span>
      </div>
    </div>
  )
}

/** The chapter list — current chapter lit, completed chapters checked. */
function Chapters({ className }: { className?: string }) {
  const { book, currentChapterId, playing, onSelectChapter } = useAudiobook()

  const currentIndex = book.chapters.findIndex((c) => c.id === currentChapterId)

  return (
    <ul data-slot="audiobook-chapters" className={cn("divide-y divide-border/50 overflow-hidden rounded-lg border border-border/70 bg-card/20", className)}>
      {book.chapters.map((chapter, index) => {
        const active = chapter.id === currentChapterId
        const done = currentIndex >= 0 && index < currentIndex
        return (
          <li key={chapter.id}>
            <button
              type="button"
              onClick={() => onSelectChapter?.(chapter.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors",
                active ? "bg-primary/10" : "hover:bg-muted/40"
              )}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center", active ? "text-primary" : "text-muted-foreground")}>
                {active ? (
                  playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="ml-0.5 size-3.5" />
                ) : done ? (
                  <CheckIcon className="size-3.5 text-primary/60" />
                ) : (
                  <span className="font-mono text-[11px] tabular-nums">{index + 1}</span>
                )}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-sm", active ? "font-medium text-primary" : "text-foreground")}>{chapter.title}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDuration(chapter.duration)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The transport for the current chapter — a label-less AudioPlayer. */
function Player({ className }: { className?: string }) {
  const { book, currentChapterId, onTimeUpdate } = useAudiobook()
  const chapter = book.chapters.find((c) => c.id === currentChapterId) ?? book.chapters[0]
  if (!chapter) return null
  return (
    <AudioPlayer
      key={chapter.id}
      src={chapter.src}
      duration={chapter.duration}
      samples={chapter.samples}
      showLabel={false}
      onTimeUpdate={onTimeUpdate}
      className={className}
    />
  )
}

/** The conventional composition: cover + header, overall progress, chapters, transport. */
function Card({
  book,
  currentChapterId,
  playing,
  currentTime,
  onSelectChapter,
  onTimeUpdate,
  className,
}: {
  book: AudiobookData
  currentChapterId?: string
  playing?: boolean
  currentTime?: number
  onSelectChapter?: (id: string) => void
  onTimeUpdate?: (time: number) => void
  className?: string
}) {
  return (
    <Root
      book={book}
      currentChapterId={currentChapterId}
      playing={playing}
      currentTime={currentTime}
      onSelectChapter={onSelectChapter}
      onTimeUpdate={onTimeUpdate}
      className={className}
    >
      <div className="flex gap-3">
        <Cover className="w-20" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="min-w-0">
            <Title />
            <Author />
          </div>
          <Progress className="mt-auto" />
        </div>
      </div>
      <Player />
      <Chapters />
    </Root>
  )
}

export const Audiobook = { Root, Cover, Title, Author, Progress, Chapters, Player, Card }
