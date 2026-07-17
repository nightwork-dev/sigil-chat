// ArticleShell — a two-pane long-form article layout rendered by the CLI
// Sigil Design's `sigil render` pipeline into one portable HTML
// document that is SSR'd AND hydrated in the browser.
//
// Scroll-spy is a React-owned hook (like its sibling GuideShell): a post-
// hydration useEffect wires an IntersectionObserver over every `section[id]`
// and lifts the active chapter into component state. The active state flows
// down to the TOC anchors as `data-active`/`aria-current`, so React owns those
// attributes end-to-end — no imperative DOM mutation that hydration could
// clobber. The TOC links stay plain `#id` anchors, so chapter navigation still
// works with JavaScript disabled; only the live highlight needs the hook.

"use client"

import type { ReactNode } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { useScrollSpy } from "@workspace/ui/hooks/use-scroll-spy"
import { cn } from "@workspace/ui/lib/utils"

export interface ArticleChapter {
  id: string
  title: string
}

interface RootProps {
  title: string
  /** Italic standfirst / subtitle under the title. */
  standfirst?: ReactNode
  /** Small mono kicker above the title (e.g. a series or doc kind). */
  kicker?: string
  chapters: ArticleChapter[]
  children: ReactNode
  className?: string
}

function Root({ title, standfirst, kicker, chapters, children, className }: RootProps) {
  const { activeId } = useScrollSpy(chapters)
  return (
    <div
      data-article-root
      data-slot="article-shell"
      className={cn("mx-auto min-h-screen max-w-6xl bg-background px-4 text-foreground sm:px-6 lg:px-8", className)}
    >
      <div className="lg:flex lg:gap-10">
        <Toc title="Contents" chapters={chapters} activeId={activeId} />
        <article className="min-w-0 flex-1 pb-24 lg:pt-16">
          <header className="mx-auto max-w-2xl pt-10 lg:pt-0">
            {kicker && (
              <div className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
                {kicker}
              </div>
            )}
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {standfirst && (
              <p className="mt-4 text-pretty text-lg italic leading-relaxed text-muted-foreground">{standfirst}</p>
            )}
            <hr className="mt-8 border-border" />
          </header>
          <div className="mx-auto max-w-2xl">{children}</div>
        </article>
      </div>
    </div>
  )
}

function Toc({ title, chapters, activeId }: { title: string; chapters: ArticleChapter[]; activeId: string }) {
  const list = (
    <ol className="space-y-0.5">
      {chapters.map((c, i) => {
        const active = c.id === activeId
        return (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              data-toc-link
              data-active={active ? "true" : undefined}
              aria-current={active ? "true" : undefined}
              className="flex gap-2.5 rounded px-2 py-1.5 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"
            >
              <span className="w-4 shrink-0 pt-px text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
                {i + 1}
              </span>
              <span className="min-w-0">{c.title}</span>
            </a>
          </li>
        )
      })}
    </ol>
  )

  return (
    <>
      {/* Desktop: sticky rail. Hidden in print. */}
      <nav
        aria-label={title}
        className="hidden shrink-0 print:hidden lg:block lg:w-60 lg:self-start lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:py-16"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            {title}
          </span>
          <span className="h-px flex-1 bg-primary/15" />
        </div>
        {list}
      </nav>

      {/* Mobile: native collapsible. Works with no JS; hidden in print. */}
      <details className="mt-6 rounded-md border border-border print:hidden lg:hidden">
        <summary className="cursor-pointer select-none list-none px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          {title}
        </summary>
        <div className="border-t border-border px-2 pb-3 pt-2">{list}</div>
      </details>
    </>
  )
}

interface SectionProps {
  id: string
  title: string
  /** Uppercase mono kicker above the heading — e.g. "01" or "Section 4". */
  kicker?: string
  children: ReactNode
  className?: string
}

function Section({ id, title, kicker, children, className }: SectionProps) {
  return (
    <section id={id} data-slot="article-section" className={cn("scroll-mt-6 py-8", className)}>
      {kicker && (
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{kicker}</div>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/** A sub-heading within a section — one step below the section's <h2>. */
function Subhead({ className, render, ...props }: useRender.ComponentProps<"h3">) {
  return useRender({
    defaultTagName: "h3",
    props: mergeProps<"h3">(
      { className: cn("pt-2 text-lg font-semibold tracking-tight text-foreground", className) },
      props
    ),
    render,
    state: { slot: "article-subhead" },
  })
}

/** Large intro paragraph — the reading weight for a section's opening line. */
function Lead({ className, render, ...props }: useRender.ComponentProps<"p">) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">(
      { className: cn("text-lg leading-relaxed text-foreground/90", className) },
      props
    ),
    render,
    state: { slot: "article-lead" },
  })
}

/** Body paragraph. */
function P({ className, render, ...props }: useRender.ComponentProps<"p">) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">(
      { className: cn("text-[15px] leading-relaxed text-muted-foreground", className) },
      props
    ),
    render,
    state: { slot: "article-p" },
  })
}

/** A load-bearing pull-quote — the document's key claims/rules. */
function Callout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <blockquote
      data-slot="article-callout"
      className={cn(
        "my-6 border-l-2 border-primary bg-muted/40 py-3 pl-5 pr-4 text-lg font-medium leading-relaxed text-foreground",
        className
      )}
    >
      {children}
    </blockquote>
  )
}

/** A soft side-note — parentheticals, analogies, translations. */
function Aside({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <aside
      data-slot="article-aside"
      className={cn("my-4 border-l-2 border-border bg-muted/25 py-2 pl-4 pr-3 text-sm leading-relaxed text-muted-foreground", className)}
    >
      {title && <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{title}</div>}
      {children}
    </aside>
  )
}

interface ListProps {
  ordered?: boolean
  children: ReactNode
  className?: string
}

/** An unordered or ordered list, styled to the article rhythm. */
function List({ ordered, children, className }: ListProps) {
  const cls = cn(
    "space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground",
    ordered ? "list-decimal marker:font-mono marker:text-primary/70" : "list-disc marker:text-primary/50",
    className
  )
  return ordered ? <ol className={cls}>{children}</ol> : <ul className={cls}>{children}</ul>
}

function Item({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("pl-1.5 [&>strong]:font-semibold [&>strong]:text-foreground", className)}>{children}</li>
}

interface FigureProps {
  src: string
  alt: string
  /** Optional short caption rendered under the diagram. */
  caption?: ReactNode
  className?: string
}

/** A centered, width-capped diagram with its descriptive alt preserved. */
function Figure({ src, alt, caption, className }: FigureProps) {
  return (
    <figure data-slot="article-figure" className={cn("my-8", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="mx-auto block h-auto w-full max-w-2xl rounded-lg border border-border"
      />
      {caption && (
        <figcaption className="mx-auto mt-3 max-w-xl text-center text-[13px] leading-relaxed text-muted-foreground/80">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

/** A plain horizontal divider between major movements of the article. */
function Divider({ className }: { className?: string }) {
  return <hr className={cn("my-10 border-border", className)} />
}

export const ArticleShell = { Root, Section, Subhead, Lead, P, Callout, Aside, List, Item, Figure, Divider }
