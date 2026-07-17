// Content for /examples/landing — a marketing/landing page for a *fictional*
// product (Ferrule, a config-integrity tool), NOT Sigil itself: this is a
// template someone copies to sell their own product. It demonstrates that the
// instrument-grade design language also does a landing page — hero, an
// asymmetric feature band (varied card weights, not a uniform grid), a
// product-detail band that uses the Terminal component as the product's
// visual hook (instrument register as the "screenshot"), and a plain footer.
//
// Restraint: theme tokens only, no gradients, body copy ≥14px, dense-not-airy.

import { Button } from "@workspace/ui/components/button"
import { Terminal, type TerminalEntry } from "@workspace/ui/components/creative/terminal"
import { ShieldCheck, GitCompareArrows, FileSignature } from "lucide-react"

const CLI_SESSION: TerminalEntry[] = [
  { id: "c0", message: "$ ferrule validate --env prod", severity: "info" },
  { id: "c1", message: "checking 214 keys against schema…", severity: "info" },
  { id: "c2", message: "cache.ttl coerced string→duration (900 → 15m)", severity: "warn" },
  { id: "c3", message: "billing.webhook_secret missing in prod", severity: "error" },
  { id: "c4", message: "1 error, 1 warning — apply blocked", severity: "error" },
  { id: "c5", message: "$ ferrule diff staging..prod", severity: "info" },
  { id: "c6", message: "~ ratelimit.rps  120 → 200", severity: "info" },
  { id: "c7", message: "+ feature.new_checkout  true", severity: "info" },
]

type Feature = {
  icon: typeof ShieldCheck
  title: string
  body: string
}

const PRIMARY_FEATURE: Feature = {
  icon: ShieldCheck,
  title: "Typed schemas, enforced at every boundary",
  body:
    "Every configuration value carries a type and a validator. Invalid config fails at commit, in CI, and at deploy — never in production at 3am. Coercions are explicit and logged, so a stringly-typed duration can't silently become the number 900.",
}

const SECONDARY_FEATURES: Feature[] = [
  {
    icon: GitCompareArrows,
    title: "Diff before apply",
    body: "See the exact key-level delta between any two environments before a single value lands. No blind promotes.",
  },
  {
    icon: FileSignature,
    title: "Signed & reversible",
    body: "Every change is attributed, cryptographically signed, and versioned. Roll back to any prior state in one command.",
  },
]

function FeatureIcon({ icon: Icon }: { icon: typeof ShieldCheck }) {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/12 text-primary">
      <Icon className="size-4" />
    </span>
  )
}

export function LandingExample() {
  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8">
      {/* Hero — headline carries the message; subline is one sentence. */}
      <section className="py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
          Config integrity for distributed systems
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Configuration that can&rsquo;t drift.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Ferrule gives every config value a type, a signature, and a history — so what
          you shipped is exactly what you reviewed, in every environment, every time.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-9 px-4 text-[13px]"
            nativeButton={false}
            render={<a href="#get-started" />}
          >
            Start free
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-9 px-4 text-[13px]"
            nativeButton={false}
            render={<a href="#docs" />}
          >
            Read the docs
          </Button>
        </div>
      </section>

      {/* Feature band — asymmetric: one wide anchor feature + two narrow ones.
          Weights reflect priority (typed schemas is the headline capability). */}
      <section className="grid gap-4 pb-16 md:grid-cols-3">
        <article className="rounded-lg border border-border bg-card p-6 md:col-span-2 md:row-span-2">
          <FeatureIcon icon={PRIMARY_FEATURE.icon} />
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            {PRIMARY_FEATURE.title}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {PRIMARY_FEATURE.body}
          </p>
        </article>
        {SECONDARY_FEATURES.map((f) => (
          <article key={f.title} className="rounded-lg border border-border bg-card p-6">
            <FeatureIcon icon={f.icon} />
            <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
              {f.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </article>
        ))}
      </section>

      {/* Product-detail band — prose paired with the Terminal as the product's
          visual hook (a config tool's screenshot IS its CLI). */}
      <section className="grid items-center gap-8 border-t border-border py-16 md:grid-cols-2 md:gap-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
            The workflow
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Validate, diff, apply.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The Ferrule CLI is the whole loop. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">validate</code> checks
            every key against its schema and blocks a broken apply.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">diff</code> shows
            the exact delta between environments. Nothing lands that you didn&rsquo;t see
            first.
          </p>
        </div>
        <div className="min-w-0">
          <Terminal entries={CLI_SESSION} showLineNumbers maxVisibleLines={9} fontSize={11} />
        </div>
      </section>

      {/* Footer — plain, product-scoped. */}
      <footer className="flex flex-col gap-3 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-sm font-medium tracking-tight text-foreground">
          Ferrule
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <a href="#docs" className="transition-colors hover:text-foreground">Docs</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          <a href="#changelog" className="transition-colors hover:text-foreground">Changelog</a>
          <a href="#github" className="transition-colors hover:text-foreground">GitHub</a>
        </nav>
        <span className="font-mono text-[11px] text-muted-foreground/70">© 2026 Ferrule Labs</span>
      </footer>
    </div>
  )
}
