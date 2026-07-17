import { useState } from "react"
import { AudioPlayer } from "@workspace/ui/components/media/audio-player"
import { NowPlaying } from "@workspace/ui/components/media/now-playing"
import { Playlist } from "@workspace/ui/components/media/playlist"
import { Audiobook } from "@workspace/ui/components/media/audiobook"
import {
  ResourceGallery,
  ResourceGalleryHeader,
  ResourceGalleryTitle,
  ResourceGalleryDescription,
  ResourceSection,
  ResourceGrid,
  ResourceCard,
} from "@workspace/ui/components/media/resource-gallery"
import { SYNTH_PRESETS, TONE_SRC, TONE_DURATION } from "@/components/showcase/tone-audio"
import { Exhibit } from "@/components/showcase/exhibit"

// Media — audio/media playback surfaces: transports that play a clip and the
// compositions that arrange many of them (now-playing, playlists, audiobooks,
// galleries). The bar-waveform scrubber IS the signal (played bars encode
// position). That's the line against Displays (skeuomorphic readouts that
// render a value, not play a stream) and Layout (arranges content, owns no
// playback). All demos run on the same self-contained synth previews +
// generated cover art. Append further media exhibits here as they land.

const NOW_TRACK = {
  id: "np",
  title: SYNTH_PRESETS[0]!.name,
  artist: "Sigil Synthworks",
  imageSrc: "/gallery/pack-1.png",
  imageAlt: `${SYNTH_PRESETS[0]!.name} cover art`,
  src: SYNTH_PRESETS[0]!.src,
  duration: SYNTH_PRESETS[0]!.seconds,
}

const PLAYLIST_TRACKS = SYNTH_PRESETS.map((p, i) => ({
  id: p.id,
  title: p.name,
  artist: p.kind,
  duration: p.seconds,
  imageSrc: `/gallery/pack-${i + 1}.png`,
  imageAlt: `${p.name} cover art`,
}))

const AUDIOBOOK = {
  id: "ab",
  title: "The Modular Manual",
  author: "A. Sequencer",
  imageSrc: "/gallery/pack-6.png",
  imageAlt: "The Modular Manual cover art",
  chapters: SYNTH_PRESETS.slice(0, 5).map((p, i) => ({
    id: p.id,
    title: `Ch. ${i + 1} · ${p.name}`,
    duration: p.seconds,
    src: p.src,
  })),
}

export function MediaShowcase() {
  const [activeTrack, setActiveTrack] = useState<string>(PLAYLIST_TRACKS[1]!.id)
  const [chapterId, setChapterId] = useState<string>(AUDIOBOOK.chapters[0]!.id)

  return (
    <div className="space-y-4 p-6">
      <Exhibit title="Now Playing" subtitle="cover · title · artist · embedded transport" installName="now-playing" className="lg:col-span-2">
        <NowPlaying.Bar track={NOW_TRACK} />
      </Exhibit>

      <Exhibit title="Audio Player" subtitle="bar-waveform scrubber · the played bars ARE the signal · click to seek, play to advance" installName="audio-player">
        <div className="flex flex-col gap-3">
          <AudioPlayer src={TONE_SRC} duration={TONE_DURATION} label="take-04.wav" />
          <AudioPlayer src={TONE_SRC} duration={TONE_DURATION} label="passage · 2s–4s window" startTime={2} endTime={4} size="sm" />
        </div>
      </Exhibit>

      <Exhibit title="Audio Player · variants" subtitle="minimal (frameless, flush) · no time readout · no label" installName="audio-player">
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card/40 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">variant=&quot;minimal&quot;</p>
            <AudioPlayer src={TONE_SRC} duration={TONE_DURATION} variant="minimal" showLabel={false} />
          </div>
          <AudioPlayer src={TONE_SRC} duration={TONE_DURATION} label="showTime={false}" showTime={false} size="sm" />
        </div>
      </Exhibit>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Exhibit title="Playlist" subtitle="track rows · active highlight · covers · click to select" installName="playlist">
          <Playlist.Root activeId={activeTrack} playing showCovers onSelect={setActiveTrack}>
            {PLAYLIST_TRACKS.map((track, index) => (
              <Playlist.Row key={track.id} track={track} index={index} />
            ))}
          </Playlist.Root>
        </Exhibit>

        <Exhibit title="Audiobook" subtitle="cover · chapters · overall progress · per-chapter transport" installName="audiobook">
          <Audiobook.Card book={AUDIOBOOK} currentChapterId={chapterId} onSelectChapter={setChapterId} />
        </Exhibit>
      </div>

      <Exhibit title="Audio Player · spectrogram" subtitle="viz=&quot;spectrogram&quot; · frequency×time heat-field of the whole clip · magnitude → amber · click to seek, playhead tracks" installName="audio-player">
        <div className="flex flex-col gap-3">
          <AudioPlayer
            src={SYNTH_PRESETS[0]!.src}
            duration={SYNTH_PRESETS[0]!.seconds}
            label={`${SYNTH_PRESETS[0]!.name} · spectrogram`}
            viz="spectrogram"
            size="lg"
          />
          <AudioPlayer
            src={SYNTH_PRESETS[2]!.src}
            duration={SYNTH_PRESETS[2]!.seconds}
            viz="spectrogram"
            variant="minimal"
            showLabel={false}
            size="sm"
          />
        </div>
      </Exhibit>

      <Exhibit
        title="Resource Gallery"
        subtitle="header · titled sections · card grid · a real player on every card"
        installName="resource-gallery"
      >
        <ResourceGallery density="compact">
          <ResourceGalleryHeader>
            <div>
              <ResourceGalleryTitle>Sound Packs</ResourceGalleryTitle>
              <ResourceGalleryDescription>Preset previews — cover art, and a real player on every card</ResourceGalleryDescription>
            </div>
          </ResourceGalleryHeader>

          <ResourceSection title="Featured" count={3}>
            <ResourceGrid columns="three">
              {SYNTH_PRESETS.slice(0, 3).map((p, i) => (
                <ResourceCard
                  key={p.id}
                  title={p.name}
                  meta={`${p.presetCount} presets · ${p.kind}`}
                  imageSrc={`/gallery/pack-${i + 1}.png`}
                  imageAlt={`${p.name} cover art`}
                  status={i === 0 ? "Featured" : undefined}
                  statusVariant="secondary"
                  actions={<AudioPlayer src={p.src} duration={p.seconds} size="sm" variant="minimal" showLabel={false} showTime={false} />}
                />
              ))}
            </ResourceGrid>
          </ResourceSection>

          <ResourceSection title="New this week" count={3}>
            <ResourceGrid columns="three">
              {SYNTH_PRESETS.slice(3, 6).map((p, i) => (
                <ResourceCard
                  key={p.id}
                  title={p.name}
                  meta={`${p.presetCount} presets · ${p.kind}`}
                  imageSrc={`/gallery/pack-${i + 4}.png`}
                  imageAlt={`${p.name} cover art`}
                  status="New"
                  statusVariant="default"
                  actions={<AudioPlayer src={p.src} duration={p.seconds} size="sm" variant="minimal" showLabel={false} showTime={false} />}
                />
              ))}
            </ResourceGrid>
          </ResourceSection>
        </ResourceGallery>
      </Exhibit>
    </div>
  )
}
