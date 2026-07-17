// Route: /examples/playground
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx  — global nav strip (wordmark + Components/Examples + theme picker)
//   apps/web/src/routes/examples/playground.tsx — THIS FILE
// Content: Theme Studio — parametric theme authoring (dark+light), live preview,
//          WCAG contrast readout, CSS/JSON export, dev-only "Save to source"

import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import { Separator } from "@workspace/ui/components/separator"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { SunIcon, MoonIcon, CopyIcon, CheckIcon, RotateCcwIcon, GitForkIcon, SaveIcon, BracesIcon, MinusIcon, PlusIcon, LinkIcon, Link2OffIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { Area, AreaChart, Bar, BarChart, XAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { ColorScope, useScope } from "@workspace/ui/components/color-scope"
import {
  generateScheme,
  hexToHsl,
  type Strategy,
  type Mood,
  type ReservedHue,
  type Scheme,
} from "@workspace/ui/lib/color-scheme"
import { useTheme } from "@/lib/theme"
import { useSaveThemeToSource } from "@/lib/theme-authoring"
import {
  derive,
  applyDerivedTokens,
  clearDerivedTokens,
  exportAsCSS,
  contrastRatio,
  wcagRating,
  PRESETS,
  type VariantParams,
  type DerivedTokens,
  type Mode,
} from "@/lib/theme-derive"

export const Route = createFileRoute("/examples/playground")({
  component: ThemeStudio,
})

const DEFAULT_PRESET = "amber"

// ─── Accent scheme state + composition ──────────────────────────────────────

interface SchemeState {
  /** Charts driven by the generated scheme when true (else the derived ramp). */
  linked: boolean
  /** Seed color (`#rrggbb`); harmony rotates off it, categorical anchors on it. */
  seed: string
  strategy: Strategy
  n: number
  mood: Mood
  /** Regime: auto (by intent) or a forced harmony/categorical. */
  regime: "auto" | "harmony" | "categorical"
}

const DEFAULT_SCHEME: SchemeState = {
  linked: true,
  seed: "#d4a853", // canonical amber signal
  strategy: "auto",
  n: 3,
  mood: "neutral",
  regime: "auto",
}

/** Reserved status bands from this theme's own status token hexes. */
function statusHuesFrom(tokens: DerivedTokens): ReservedHue[] {
  return [tokens.destructive, tokens.success, tokens.warning, tokens.info].map((hex) => ({
    hue: hexToHsl(hex).h,
    tol: 14,
  }))
}

/** Run the engine for the studio's scheme state against a single previewed surface. */
function composeScheme(scheme: SchemeState, surface: string, statusHues: ReservedHue[]): Scheme {
  return generateScheme(
    {
      seed: scheme.seed,
      strategy: scheme.strategy,
      n: scheme.n,
      mood: scheme.mood,
      regime: scheme.regime === "auto" ? undefined : scheme.regime,
    },
    [surface],
    statusHues,
  )
}

/** Cycle a series-color list to at least `count` entries. */
function cycle(colors: string[], count: number): string[] {
  if (colors.length === 0) return []
  return Array.from({ length: count }, (_, i) => colors[i % colors.length])
}

/**
 * Resolve the Scheme panel's "auto" regime the SAME way the (label-less)
 * chart/swatch preview resolves it: by `n` alone (n>4 → categorical, else
 * harmony). The engine's own `generateScheme` auto-detection additionally
 * forces categorical whenever a label SET is passed — which is correct for
 * callers, but would make the island demo's regime silently diverge from the
 * panel readout (labels are only present because Island A is a labeled demo,
 * not because the user asked for categorical). Passing this resolved regime
 * explicitly to Island A's <ColorScope> keeps it in lockstep with what the
 * panel shows, so every control (seed/strategy/regime/n/mood) visibly acts on
 * both the swatches AND the island in the same way.
 */
function resolveAutoRegime(n: number): "harmony" | "categorical" {
  return n > 4 ? "categorical" : "harmony"
}

function ThemeStudio() {
  const { resolvedMode } = useTheme()

  // The theme being authored.
  const [params, setParams] = useState<VariantParams>(PRESETS[DEFAULT_PRESET])
  const [name, setName] = useState<string>(DEFAULT_PRESET)
  // The preset this session forked from — the target of "Reset".
  const [baseParams, setBaseParams] = useState<VariantParams>(PRESETS[DEFAULT_PRESET])
  const [basePreset, setBasePreset] = useState<string>(DEFAULT_PRESET)

  // Which appearance we're authoring. Defaults to the app's current mode so the
  // preview matches what the author already sees.
  const [authoringMode, setAuthoringMode] = useState<Mode>(resolvedMode as Mode)

  // Derived tokens — pure, memoized. NOT useEffect+setState.
  const tokens = useMemo(() => derive(params, authoringMode), [params, authoringMode])

  // The chart preview (two live recharts trees + a full card subtree) is the
  // expensive part of this page — deferring PARAMS (not tokens) lets React
  // keep the slider itself responsive on every frame while the chart catches
  // up once idle. authoringMode is NOT deferred, so the dark/light toggle
  // still flips the chart instantly.
  const deferredParams = useDeferredValue(params)
  const chartTokens = useMemo(() => derive(deferredParams, authoringMode), [deferredParams, authoringMode])

  // ── Accent scheme (the color-theory engine) ──
  const [scheme, setScheme] = useState<SchemeState>(DEFAULT_SCHEME)

  // Reserved status bands come from THIS theme's own status tokens, so the
  // guard tracks the envelope (e.g. a shifted destructive hue) rather than a
  // fixed list. Recomputed only when the status hexes move.
  const statusHues = useMemo<ReservedHue[]>(
    () => statusHuesFrom(tokens),
    [tokens.destructive, tokens.success, tokens.warning, tokens.info], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // The generated palette, fit to the PREVIEWED mode's background. Pure/memoized.
  const activeScheme = useMemo(
    () => composeScheme(scheme, tokens.background, statusHues),
    [scheme, tokens.background, statusHues],
  )

  // Deferred copy that drives the (expensive) chart previews, in step with the
  // deferred chart tokens so the sliders stay responsive.
  const deferredScheme = useDeferredValue(scheme)
  const chartScheme = useMemo(
    () => composeScheme(deferredScheme, chartTokens.background, statusHues),
    [deferredScheme, chartTokens.background, statusHues],
  )

  // ── Preview side effects (the only Effects on this page) ──
  // 1. Toggle the <html> .light/.dark marker to the AUTHORING mode so dark:/
  //    light variants + color-scheme resolve to the previewed appearance, and
  //    restore the app's real marker on unmount / mode change.
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    const hadLight = root.classList.contains("light")
    root.classList.toggle("dark", authoringMode === "dark")
    root.classList.toggle("light", authoringMode === "light")
    return () => {
      root.classList.toggle("dark", hadDark)
      root.classList.toggle("light", hadLight)
    }
  }, [authoringMode])

  // 2. Write the derived tokens (overwrites in place each change — no flash).
  useEffect(() => {
    applyDerivedTokens(tokens)
  }, [tokens])

  // 3. Clear all inline overrides on unmount so the app returns to class control.
  useEffect(() => {
    return () => clearDerivedTokens()
  }, [])

  const updateParam = useCallback(<K extends keyof VariantParams>(key: K, value: VariantParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  const loadPreset = useCallback((preset: string) => {
    const p = PRESETS[preset]
    if (!p) return
    setParams(p)
    setBaseParams(p)
    setBasePreset(preset)
    setName(preset)
  }, [])

  const fork = useCallback(() => {
    // Keep current params, rename to a fresh variant so "Save to source" won't
    // collide with the built-in.
    setName((n) => (n.endsWith("-fork") ? n : `${n}-fork`))
    toast.info(`Forked ${basePreset} — rename and tweak, then save.`)
  }, [basePreset])

  const reset = useCallback(() => {
    setParams(baseParams)
    setName(basePreset)
  }, [baseParams, basePreset])

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-xl font-medium">Theme Studio</h1>
          <p className="text-sm text-muted-foreground">
            Author a thermal envelope for both appearances. Every surface is derived; the signal is
            held to WCAG AA.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <PreviewColumn
            tokens={tokens}
            chartTokens={chartTokens}
            authoringMode={authoringMode}
            chartScheme={scheme.linked ? chartScheme : null}
            activeScheme={activeScheme}
            panelScheme={scheme}
          />
          <ControlsColumn
            params={params}
            authoringMode={authoringMode}
            onAuthoringMode={setAuthoringMode}
            onParam={updateParam}
            name={name}
            onName={setName}
            basePreset={basePreset}
            onLoadPreset={loadPreset}
            onFork={fork}
            onReset={reset}
            onSetParams={setParams}
            scheme={scheme}
            onScheme={setScheme}
            activeScheme={activeScheme}
            signal={tokens.primary}
            surface={tokens.background}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Preview column ───────────────────────────────────────────────────────────

function PreviewColumn({
  tokens,
  chartTokens,
  authoringMode,
  chartScheme,
  activeScheme,
  panelScheme,
}: {
  tokens: DerivedTokens
  chartTokens: DerivedTokens
  authoringMode: Mode
  chartScheme: Scheme | null
  activeScheme: Scheme
  panelScheme: SchemeState
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Surfaces · {authoringMode}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[
              { label: "bg", color: tokens.background },
              { label: "sidebar", color: tokens.sidebar },
              { label: "card", color: tokens.card },
              { label: "muted", color: tokens.muted },
              { label: "chip", color: tokens.secondary },
            ].map((s) => (
              <div key={s.label} className="flex-1 space-y-1.5">
                <div className="h-16 rounded-md ring-1 ring-border" style={{ backgroundColor: s.color }} />
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground">{s.label}</div>
                  <div className="text-[9px] font-mono text-muted-foreground/60">{s.color}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Signal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid h-12 place-items-center rounded-md" style={{ backgroundColor: tokens.primary }}>
              <span className="text-[10px] font-mono font-medium" style={{ color: tokens.primaryForeground }}>
                Aa
              </span>
            </div>
            <div className="text-[9px] font-mono text-muted-foreground text-center">{tokens.primary}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Text
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-sm" style={{ color: tokens.foreground }}>Primary text</div>
            <div className="text-xs" style={{ color: tokens.secondaryForeground }}>Secondary text</div>
            <div className="text-xs" style={{ color: tokens.mutedForeground }}>Muted text</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Seam
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div
              className="h-12 rounded-md"
              style={{ backgroundColor: tokens.background, boxShadow: `inset 0 0 0 1px ${tokens.border}` }}
            />
            <div className="text-[9px] font-mono text-muted-foreground text-center">{tokens.border}</div>
          </CardContent>
        </Card>
      </div>

      <ContrastCard tokens={tokens} />

      <ChartPalette tokens={chartTokens} scheme={chartScheme} />

      <ColorIslandDemo panelScheme={panelScheme} />

      <Card>
        <CardHeader>
          <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Sample UI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Primary</Button>
            <Button size="sm" variant="secondary">Secondary</Button>
            <Button size="sm" variant="outline">Outline</Button>
            <Button size="sm" variant="ghost">Ghost</Button>
            <Button size="sm" variant="destructive">Destructive</Button>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Active</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Error</Badge>
            <Badge
              style={{
                backgroundColor: activeScheme.colors[0],
                color: contrastRatio(activeScheme.colors[0], "#ffffff") >= contrastRatio(activeScheme.colors[0], "#0d0b0f")
                  ? "#ffffff"
                  : "#0d0b0f",
              }}
              title="Driven by the Scheme panel's first generated color"
            >
              scheme · {activeScheme.colors[0]}
            </Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { label: "Requests", value: "12,847" },
              { label: "Latency", value: "42ms" },
              { label: "Uptime", value: "99.98%" },
            ].map((s) => (
              <Card key={s.label} size="sm">
                <CardContent className="pt-3">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">{s.label}</div>
                  <div className="text-lg font-mono font-medium tabular-nums">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Contrast readout (the "provably legible" guard) ──────────────────────────

const CONTRAST_PAIRS: { label: string; a: keyof DerivedTokens; b: keyof DerivedTokens }[] = [
  { label: "Body / bg", a: "foreground", b: "background" },
  { label: "Signal text", a: "primaryForeground", b: "primary" },
  { label: "Signal / bg", a: "primary", b: "background" },
  { label: "Muted / bg", a: "mutedForeground", b: "background" },
]

function ContrastCard({ tokens }: { tokens: DerivedTokens }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          WCAG Contrast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {CONTRAST_PAIRS.map((pair) => {
            const ratio = contrastRatio(tokens[pair.a] as string, tokens[pair.b] as string)
            const rating = wcagRating(ratio)
            const fail = rating === "fail"
            return (
              <div key={pair.label} className="space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground">{pair.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="font-mono text-sm tabular-nums"
                    style={{ color: fail ? "var(--color-destructive)" : "var(--color-success)" }}
                  >
                    {ratio.toFixed(2)}
                  </span>
                  <span
                    data-rating={rating}
                    className={cn(
                      "rounded px-1 text-[9px] font-mono uppercase",
                      fail ? "bg-destructive/15 text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {rating}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Controls column ──────────────────────────────────────────────────────────

function ControlsColumn({
  params,
  authoringMode,
  onAuthoringMode,
  onParam,
  name,
  onName,
  basePreset,
  onLoadPreset,
  onFork,
  onReset,
  onSetParams,
  scheme,
  onScheme,
  activeScheme,
  signal,
  surface,
}: {
  params: VariantParams
  authoringMode: Mode
  onAuthoringMode: (m: Mode) => void
  onParam: <K extends keyof VariantParams>(key: K, value: VariantParams[K]) => void
  name: string
  onName: (n: string) => void
  basePreset: string
  onLoadPreset: (preset: string) => void
  onFork: () => void
  onReset: () => void
  onSetParams: (p: VariantParams) => void
  scheme: SchemeState
  onScheme: (s: SchemeState) => void
  activeScheme: Scheme
  signal: string
  surface: string
}) {
  return (
    <div className="space-y-4">
      {/* Authoring mode toggle */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Authoring
          </span>
          <div
            role="radiogroup"
            aria-label="Authoring appearance"
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5"
          >
            {(["dark", "light"] as const).map((m) => {
              const active = authoringMode === m
              const Icon = m === "dark" ? MoonIcon : SunIcon
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={m}
                  onClick={() => onAuthoringMode(m)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-mono capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3" strokeWidth={1.75} />
                  {m}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Presets + fork */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Built-ins
          </CardTitle>
          <button
            type="button"
            onClick={onFork}
            title="Fork the current theme under a new name"
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            <GitForkIcon className="size-3" /> fork
          </button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onLoadPreset(preset)}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-mono transition-colors",
                  basePreset === preset
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-secondary-foreground hover:bg-muted",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ParamSlider label="Surface Hue" value={params.surfaceHue} min={0} max={360} step={1}
            display={`${Math.round(params.surfaceHue)}°`} onChange={(v) => onParam("surfaceHue", v)} />
          <ParamSlider label="Surface Temp" value={params.surfaceTemp} min={0} max={1} step={0.01}
            display={params.surfaceTemp < 0.4 ? "cool" : params.surfaceTemp > 0.6 ? "warm" : "neutral"}
            onChange={(v) => onParam("surfaceTemp", v)} />
          <ParamSlider label="Signal Hue" value={params.signalHue} min={0} max={360} step={1}
            display={`${Math.round(params.signalHue)}°`} onChange={(v) => onParam("signalHue", v)} />
          <ParamSlider label="Signal Chroma" value={params.signalChroma} min={0} max={1} step={0.01}
            display={`${Math.round(params.signalChroma * 100)}%`} onChange={(v) => onParam("signalChroma", v)} />
          <ParamSlider label="Text Warmth" value={params.textWarmth} min={0} max={1} step={0.01}
            display={params.textWarmth < 0.3 ? "silver" : params.textWarmth > 0.7 ? "gold" : "cream"}
            onChange={(v) => onParam("textWarmth", v)} />
          <Separator />
          <ParamSlider label="Corner Radius" value={params.radius} min={0} max={16} step={1}
            display={`${Math.round(params.radius)}px`} onChange={(v) => onParam("radius", v)} />
          <ParamSlider label="Destructive Hue" value={params.destructiveHue} min={0} max={360} step={1}
            display={`${Math.round(params.destructiveHue)}°`} onChange={(v) => onParam("destructiveHue", v)} />
        </CardContent>
      </Card>

      <SchemePanel
        scheme={scheme}
        onScheme={onScheme}
        activeScheme={activeScheme}
        signal={signal}
        surface={surface}
      />

      <ExportCard params={params} name={name} onName={onName} onReset={onReset} onSetParams={onSetParams} />

      {import.meta.env.DEV && <SaveToSourceCard params={params} name={name} />}
    </div>
  )
}

// ─── Export / import / reset ──────────────────────────────────────────────────

function ExportCard({
  params,
  name,
  onName,
  onReset,
  onSetParams,
}: {
  params: VariantParams
  name: string
  onName: (n: string) => void
  onReset: () => void
  onSetParams: (p: VariantParams) => void
}) {
  const [copied, setCopied] = useState<"css" | "json" | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [importText, setImportText] = useState("")
  const [importError, setImportError] = useState<string | null>(null)

  const copy = useCallback((kind: "css" | "json", text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const doImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText) as { name?: string; params?: Partial<VariantParams> }
      const p = parsed.params ?? (parsed as Partial<VariantParams>)
      const required: (keyof VariantParams)[] = [
        "surfaceHue", "surfaceTemp", "signalHue", "signalChroma", "textWarmth", "radius", "destructiveHue",
      ]
      const next = {} as VariantParams
      for (const k of required) {
        const v = (p as Record<string, unknown>)[k]
        if (typeof v !== "number" || Number.isNaN(v)) throw new Error(`Missing or invalid "${k}"`)
        next[k] = v
      }
      onSetParams(next)
      if (parsed.name && typeof parsed.name === "string") onName(parsed.name)
      setImportError(null)
      setImportText("")
      toast.success("Imported theme JSON")
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Invalid JSON")
    }
  }, [importText, onSetParams, onName])

  const json = JSON.stringify({ name, params }, null, 2)

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => copy("css", exportAsCSS(name || "custom", params))}>
            {copied === "css" ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied === "css" ? "Copied" : "CSS"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => copy("json", json)}>
            {copied === "json" ? <CheckIcon className="size-3" /> : <BracesIcon className="size-3" />}
            {copied === "json" ? "Copied" : "JSON"}
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={onReset} title="Reset to the loaded built-in">
            <RotateCcwIcon className="size-3" />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setShowJson((s) => !s)}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground"
        >
          {showJson ? "− hide import" : "+ import JSON"}
        </button>
        {showJson && (
          <div className="space-y-1.5">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"name":"custom","params":{...}}'
              className="h-24 font-mono text-[10px]"
            />
            {importError && <div className="text-[10px] text-destructive">{importError}</div>}
            <Button size="sm" variant="secondary" className="w-full text-xs" onClick={doImport} disabled={!importText.trim()}>
              Load from JSON
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Dev-only "Save to source" ────────────────────────────────────────────────

function SaveToSourceCard({ params, name }: { params: VariantParams; name: string }) {
  const [saveName, setSaveName] = useState(name)
  const [description, setDescription] = useState("")
  const save = useSaveThemeToSource()

  // Keep the field in step with the studio name until the user edits it.
  const lastName = useRef(name)
  if (name !== lastName.current) {
    lastName.current = name
    if (saveName !== name) setSaveName(name)
  }

  const onSave = useCallback(() => {
    save.mutate(
      { name: saveName, params, description: description || undefined },
      {
        onSuccess: (res) => toast.success(`${res.updated ? "Updated" : "Saved"} theme-${res.name} — reload to select it`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    )
  }, [save, saveName, params, description])

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
          <SaveIcon className="size-3" /> Save to source · dev
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="theme name (kebab-case)"
          className="h-8 font-mono text-xs"
          aria-label="Theme name"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="description (optional)"
          className="h-8 text-xs"
          aria-label="Theme description"
        />
        <Button size="sm" className="w-full text-xs" onClick={onSave} disabled={save.isPending}>
          <SaveIcon className="size-3" />
          {save.isPending ? "Writing…" : "Write theme-" + (saveName || "…")}
        </Button>
        {save.isError && (
          <div className="text-[10px] text-destructive">
            {save.error instanceof Error ? save.error.message : "Save failed"}
          </div>
        )}
        {save.isSuccess && (
          <div className="text-[10px]" style={{ color: "var(--color-success)" }}>
            Wrote themes.css + theme.tsx + PRESETS. Reload to pick <span className="font-mono">theme-{save.data.name}</span>.
          </div>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">
          Writes committed source files. Dev only — the handler refuses in production.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Chart previews + slider ──────────────────────────────────────────────────

const AREA_DATA = [
  { t: "00", a: 42, b: 18 }, { t: "04", a: 18, b: 8 }, { t: "08", a: 68, b: 32 },
  { t: "12", a: 124, b: 58 }, { t: "16", a: 98, b: 45 }, { t: "20", a: 76, b: 30 }, { t: "24", a: 52, b: 22 },
]
const BAR_DATA = [
  { name: "A", v1: 34, v2: 22, v3: 14 }, { name: "B", v1: 28, v2: 18, v3: 20 },
  { name: "C", v1: 21, v2: 26, v3: 12 }, { name: "D", v1: 16, v2: 14, v3: 24 },
]

// Memoized on `tokens`+`colors` — the parent passes the DEFERRED tokens, so
// these two live recharts trees (the expensive part of the page) skip re-render
// on every slider frame and only recompute once the deferred value catches up.
// `colors` are the series colors (from the derived ramp, or the scheme engine
// when the Scheme panel is linked).
const ChartPreviewArea = memo(function ChartPreviewArea({ tokens, colors }: { tokens: DerivedTokens; colors: string[] }) {
  return (
    <div className="h-28 w-full rounded-md p-1" style={{ backgroundColor: tokens.background }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={AREA_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} />
          <XAxis dataKey="t" tick={{ fontSize: 8, fill: tokens.mutedForeground }} stroke={tokens.border} />
          <Area type="monotone" dataKey="a" stroke={colors[0]} fill={colors[0]} fillOpacity={0.15} strokeWidth={1.5} />
          <Area type="monotone" dataKey="b" stroke={colors[1]} fill={colors[1]} fillOpacity={0.1} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})

const ChartPreviewBar = memo(function ChartPreviewBar({ tokens, colors }: { tokens: DerivedTokens; colors: string[] }) {
  return (
    <div className="h-28 w-full rounded-md p-1" style={{ backgroundColor: tokens.background }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={BAR_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} />
          <XAxis dataKey="name" tick={{ fontSize: 8, fill: tokens.mutedForeground }} stroke={tokens.border} />
          <Bar dataKey="v1" fill={colors[0]} radius={[2, 2, 0, 0]} />
          <Bar dataKey="v2" fill={colors[1]} radius={[2, 2, 0, 0]} />
          <Bar dataKey="v3" fill={colors[2]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})

// The whole "Chart Palette" card (both charts + the swatch row) is memoized as
// one unit on the deferred inputs, so the swatch hexes lag in step with the
// charts rather than updating a beat ahead of them. When `scheme` is present
// (the Scheme panel is linked), the series colors come from the engine and
// replace the naive signal-hue ramp; otherwise the derived chart-* tokens.
const ChartPalette = memo(function ChartPalette({ tokens, scheme }: { tokens: DerivedTokens; scheme: Scheme | null }) {
  const derivedRamp = [tokens.chart1, tokens.chart2, tokens.chart3, tokens.chart4, tokens.chart5]
  const series = scheme ? cycle(scheme.colors, 5) : derivedRamp
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Chart Palette
        </CardTitle>
        {scheme && (
          <span className="text-[9px] font-mono text-primary" title="Series colors come from the generated scheme">
            scheme · {scheme.regime}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ChartPreviewArea tokens={tokens} colors={series} />
          <ChartPreviewBar tokens={tokens} colors={series} />
        </div>
        <div className="flex gap-1.5">
          {series.map((c, i) => (
            <div key={i} className="flex-1 space-y-1">
              <div className="h-4 rounded" style={{ backgroundColor: c }} />
              <div className="text-[8px] font-mono text-muted-foreground text-center">{c}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

function ParamSlider({
  label, value, min, max, step, display, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono text-foreground tabular-nums">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </div>
  )
}

// ─── Scheme panel (the color-theory engine controls) ──────────────────────────

const STRATEGIES: Strategy[] = [
  "auto", "complementary", "analogous", "triadic", "split-complementary", "tetradic",
]
const MOODS: Mood[] = ["calm", "neutral", "energetic"]
const REGIMES: SchemeState["regime"][] = ["auto", "harmony", "categorical"]

function SchemePanel({
  scheme,
  onScheme,
  activeScheme,
  signal,
  surface,
}: {
  scheme: SchemeState
  onScheme: (s: SchemeState) => void
  activeScheme: Scheme
  signal: string
  surface: string
}) {
  const set = (patch: Partial<SchemeState>) => onScheme({ ...scheme, ...patch })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Scheme
        </CardTitle>
        <button
          type="button"
          onClick={() => set({ linked: !scheme.linked })}
          aria-pressed={scheme.linked}
          title={scheme.linked ? "Charts driven by the scheme — click to unlink" : "Charts use the derived ramp — click to drive them from the scheme"}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono transition-colors",
            scheme.linked ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {scheme.linked ? <LinkIcon className="size-2.5" /> : <Link2OffIcon className="size-2.5" />}
          {scheme.linked ? "charts linked" : "unlinked"}
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Seed */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">Seed</span>
          <div className="flex items-center gap-2">
            <label className="relative size-7 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
              <span className="absolute inset-0" style={{ backgroundColor: scheme.seed }} />
              <input
                type="color"
                value={scheme.seed}
                onChange={(e) => set({ seed: e.target.value })}
                aria-label="Seed color"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <span className="font-mono text-xs text-foreground tabular-nums">{scheme.seed}</span>
            <button
              type="button"
              onClick={() => set({ seed: signal })}
              className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-secondary-foreground hover:bg-muted"
              title="Use the current signal color as the seed"
            >
              signal
            </button>
          </div>
        </div>

        {/* Strategy */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">Strategy</span>
          <select
            value={scheme.strategy}
            onChange={(e) => set({ strategy: e.target.value as Strategy })}
            aria-label="Harmony strategy"
            disabled={scheme.regime === "categorical"}
            className="h-7 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Regime */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">Regime</span>
          <Segmented
            options={REGIMES}
            value={scheme.regime}
            onChange={(r) => set({ regime: r })}
            ariaLabel="Generation regime"
          />
        </div>

        {/* n stepper */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">Colors</span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="Fewer colors"
                onClick={() => set({ n: Math.max(2, scheme.n - 1) })}
                disabled={scheme.n <= 2}
                className="grid size-6 place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <MinusIcon className="size-3" />
              </button>
              <span className="w-5 text-center font-mono text-xs tabular-nums">{scheme.n}</span>
              <button
                type="button"
                aria-label="More colors"
                onClick={() => set({ n: Math.min(5, scheme.n + 1) })}
                disabled={scheme.n >= 5}
                className="grid size-6 place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <PlusIcon className="size-3" />
              </button>
            </div>
          </div>
          {scheme.n > 4 && scheme.regime !== "categorical" && (
            <p className="text-[9px] leading-snug text-warning">
              Harmonies degrade past ~4 hues — consider the categorical regime.
            </p>
          )}
        </div>

        {/* Mood */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">Mood</span>
          <Segmented
            options={MOODS}
            value={scheme.mood}
            onChange={(m) => set({ mood: m })}
            ariaLabel="Mood bias"
          />
        </div>

        <Separator />

        {/* Generated swatches + per-color legibility readout */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">Generated · {activeScheme.regime}</span>
            {activeScheme.regime === "harmony" && (
              <span className="text-[9px] font-mono text-muted-foreground/70">{activeScheme.strategy}</span>
            )}
          </div>
          <div className="space-y-1">
            {activeScheme.colors.map((c, i) => {
              const ratio = contrastRatio(c, surface)
              // Series are graphical objects (3:1 AA); text-on-surface is 4.5.
              const band = ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA·lg" : "low"
              const ok = ratio >= 3
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="size-4 shrink-0 rounded ring-1 ring-border" style={{ backgroundColor: c }} />
                  <span className="font-mono text-[10px] text-foreground tabular-nums">{c}</span>
                  <span
                    className="ml-auto font-mono text-[10px] tabular-nums"
                    style={{ color: ok ? "var(--color-success)" : "var(--color-destructive)" }}
                  >
                    {ratio.toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "w-10 rounded px-1 text-center text-[9px] font-mono",
                      ok ? "text-muted-foreground" : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {band}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {options.map((o) => {
        const active = value === o
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 rounded px-1.5 py-1 text-[10px] font-mono capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

// ─── Live color-island demo (the ColorScope primitive in action) ───────────────
// Two INDEPENDENT islands. Each generates a self-contained categorical palette
// and exposes it as scoped `--scheme-*` vars on its OWN element — the bars read
// those vars, so this proves the vars resolve inside the scope (inspect the DOM:
// the vars sit on [data-slot="color-scope"], never on <html>). The two islands
// may reuse hues; that's fine, they're visually separated scopes.

const ISLAND_A = [
  { label: "us-east", v: 0.9 }, { label: "us-west", v: 0.6 },
  { label: "eu-central", v: 0.75 }, { label: "ap-south", v: 0.45 },
]
const ISLAND_B = [
  { label: "reads", v: 0.7 }, { label: "writes", v: 0.5 }, { label: "errors", v: 0.85 },
]

function ColorIslandDemo({ panelScheme }: { panelScheme: SchemeState }) {
  // Island A follows the Scheme panel's controls exactly (seed/strategy/n/mood/
  // regime) — moving any control visibly re-colors it. Island B stays on a
  // fixed, independent config — proof that islands are scoped, not global (A
  // changing never touches B).
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Color Islands · ColorScope
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Each block generates its own palette as scoped <span className="font-mono">--scheme-*</span> vars —
          independent, legible in both modes, and stable per label.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <ColorScope
              labels={ISLAND_A.map((s) => s.label)}
              n={panelScheme.n}
              seed={panelScheme.seed}
              strategy={panelScheme.strategy}
              mood={panelScheme.mood}
              regime={panelScheme.regime === "auto" ? resolveAutoRegime(panelScheme.n) : panelScheme.regime}
              className="space-y-2 rounded-md border border-primary/30 p-2.5"
            >
              <IslandBars series={ISLAND_A} />
              <ColorScope.Swatches withLabels={ISLAND_A.map((s) => s.label)} />
            </ColorScope>
            <p className="text-[9px] font-mono text-primary">↑ driven by the panel above</p>
          </div>
          <div className="space-y-1">
            <ColorScope
              labels={ISLAND_B.map((s) => s.label)}
              n={8}
              seed="#5b8cc4"
              className="space-y-2 rounded-md border border-border p-2.5"
            >
              <IslandBars series={ISLAND_B} />
              <ColorScope.Swatches withLabels={ISLAND_B.map((s) => s.label)} />
            </ColorScope>
            <p className="text-[9px] font-mono text-muted-foreground">↑ fixed, independent config</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IslandBars({ series }: { series: { label: string; v: number }[] }) {
  const scope = useScope()
  return (
    <div className="flex h-16 items-end gap-1.5">
      {series.map((s) => (
        <div
          key={s.label}
          className="flex-1 rounded-t"
          // Reads the SCOPED css var — resolves only inside this ColorScope.
          style={{ height: `${s.v * 100}%`, backgroundColor: `var(--scheme-${scope.indexFor(s.label) + 1})` }}
          title={`${s.label} → --scheme-${scope.indexFor(s.label) + 1}`}
        />
      ))}
    </div>
  )
}