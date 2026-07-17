import { Image } from "@workspace/ui/components/image/image"
import { Figure } from "@workspace/ui/components/image/figure"
import { ImageCompare } from "@workspace/ui/components/image/image-compare"
import { Lightbox } from "@workspace/ui/components/image/lightbox"
import { AvatarStack } from "@workspace/ui/components/image/avatar-stack"
import { Exhibit } from "@/components/showcase/exhibit"

// Image — the image primitives: the aspect-locked base <Image> (lazy, skeleton
// while loading, a neutral field on error — never a broken-image glyph), the
// semantic Figure (image + caption + credit), a before/after Compare slider, a
// click-to-zoom Lightbox, and a data-driven Avatar Stack. Everything runs on
// the same generated cover plates. That's the line against Media (playback) and
// Layout (arranges content) — these OWN how a picture is shown.

const PEOPLE = [
  { src: "/gallery/pack-1.png", alt: "Ada" },
  { src: "/gallery/pack-2.png", alt: "Bell" },
  { src: "/gallery/pack-3.png", alt: "Cyrus" },
  { src: "/gallery/pack-4.png", alt: "Dara" },
  { src: "/gallery/pack-5.png", alt: "Evan" },
  { src: "/gallery/pack-6.png", alt: "Faye" },
]

export function ImageShowcase() {
  return (
    <div className="space-y-4 p-6">
      <Exhibit
        title="Image"
        subtitle="aspect-locked (no layout shift) · lazy · skeleton while loading · neutral fallback on error"
        installName="image"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Image src="/gallery/pack-1.png" alt="Amber sine plate" ratio="4/3" rounded="lg" />
          <Image src="/gallery/pack-2.png" alt="Teal scope plate" ratio="1/1" rounded="lg" />
          <Image src="/gallery/pack-3.png" alt="Patch-cable plate" ratio="3/2" rounded="lg" />
          <Image src="/gallery/pack-5.png" alt="Spectral bloom plate" ratio="4/3" rounded="lg" />
          <Image src="/gallery/pack-6.png" alt="VU-arc plate" ratio="4/3" rounded="lg" />
          {/* fit="contain" — the whole plate letterboxed rather than cropped to fill. */}
          <Image src="/gallery/pack-4.png" alt="Knobs plate, contained" ratio="4/3" fit="contain" rounded="lg" className="bg-muted/60" />
        </div>
      </Exhibit>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Exhibit title="Figure" subtitle="image + caption + credit · semantic figure / figcaption" installName="figure">
          <Figure.Root src="/gallery/pack-4.png" alt="A wall of illuminated synthesizer knobs">
            <Figure.Image ratio="3/2" rounded="md" />
            <Figure.Caption>
              <strong>Glass Triangle</strong> — the pad pack&apos;s cover plate, shallow depth of field.
            </Figure.Caption>
            <Figure.Credit>Generated · Sigil Synthworks</Figure.Credit>
          </Figure.Root>
        </Exhibit>

        <Exhibit title="Lightbox" subtitle="thumbnail → full-resolution zoom · backdrop / Escape to close" installName="lightbox">
          <Lightbox
            src="/gallery/pack-2.png"
            alt="Teal oscilloscope trace"
            caption="Full-resolution plate — click the backdrop or press Escape to close."
          />
        </Exhibit>
      </div>

      <Exhibit title="Image Compare" subtitle="before/after slider · drag the divider · arrows / Shift / Home / End" installName="image-compare">
        <ImageCompare
          before={{ src: "/gallery/pack-1.png", alt: "Ungraded", label: "Before" }}
          after={{ src: "/gallery/pack-2.png", alt: "Graded", label: "After" }}
          className="aspect-[16/9]"
        />
      </Exhibit>

      <Exhibit title="Avatar Stack" subtitle="overlapping avatars · +N overflow · size threads through" installName="avatar-stack">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AvatarStack avatars={PEOPLE} max={4} />
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">max=4 · +2</span>
          </div>
          <div className="flex items-center gap-3">
            <AvatarStack avatars={PEOPLE} max={6} size="sm" />
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">size=&quot;sm&quot; · all six</span>
          </div>
        </div>
      </Exhibit>
    </div>
  )
}
