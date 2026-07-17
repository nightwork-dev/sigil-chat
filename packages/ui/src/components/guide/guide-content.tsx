// Guide content primitives — the typed prose vocabulary a guide/docs page
// composes from. GuideSection registers its ref with GuideShell's scroll-spy
// so the left nav highlights as you scroll. Lead/P are the two prose
// weights; Aside is a soft side-note callout. Deliberately minimal — no
// card-on-everything; the reading column carries the rhythm.

import type { ReactNode } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@workspace/ui/lib/utils"
import type { RegisterRef } from "@workspace/ui/components/guide/guide-shell"

interface GuideSectionProps {
  id: string
  title: string
  /** A small uppercase kicker above the title, e.g. "Feature" or "Lesson 2". */
  eyebrow?: string
  children: ReactNode
  /** Forwarded by GuideShell's render-prop; registers this section for scroll-spy. */
  registerRef?: RegisterRef
  className?: string
}

function GuideSection({ id, title, eyebrow, children, registerRef, className }: GuideSectionProps) {
  return (
    <section
      id={id}
      data-slot="guide-section"
      ref={registerRef ? (el) => registerRef(id, el) : undefined}
      className={cn("scroll-mt-8 py-8 first:pt-0", className)}
    >
      {eyebrow && <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</div>}
      <h2 className="text-xl font-medium tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function Lead({ className, render, ...props }: useRender.ComponentProps<"p">) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn("text-base leading-relaxed text-foreground/90", className) }, props),
    render,
    state: { slot: "guide-lead" },
  })
}

function P({ className, render, ...props }: useRender.ComponentProps<"p">) {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn("text-sm leading-relaxed text-muted-foreground", className) }, props),
    render,
    state: { slot: "guide-p" },
  })
}

interface AsideProps extends useRender.ComponentProps<"aside"> {
  title?: string
}

function Aside({ title, children, className, render, ...props }: AsideProps) {
  const content = (
    <>
      {title && <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-primary">{title}</div>}
      <div className="leading-relaxed text-muted-foreground">{children}</div>
    </>
  )
  return useRender({
    defaultTagName: "aside",
    props: mergeProps<"aside">(
      { className: cn("my-4 border-l-2 border-primary/40 bg-muted/30 py-2 pr-3 pl-4 text-sm", className), children: content },
      props
    ),
    render,
    state: { slot: "guide-aside" },
  })
}

export { GuideSection, Lead, P, Aside }
export type { GuideSectionProps }
