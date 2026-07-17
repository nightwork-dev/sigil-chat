import { useTheme, type ThemeDef, type ThemeMode, type ResolvedMode } from "@/lib/theme"
import { cn } from "@workspace/ui/lib/utils"
import { ColorSwatch } from "@workspace/ui/components/color-swatch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react"

/** The two colors a swatch shows for a theme, given the resolved appearance:
 *  its paper (light) or void (dark) surface, split against its signal. */
function swatchColors(def: ThemeDef, resolved: ResolvedMode): [string, string] {
  return [resolved === "light" ? def.paper : def.void, def.signal]
}

function ThemeSwatch({
  def,
  active,
  resolved,
  onClick,
}: {
  def: ThemeDef
  active: boolean
  resolved: ResolvedMode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${def.label} — ${def.description}`}
      aria-label={`${def.label} — ${def.description}`}
      aria-pressed={active}
      className={cn(
        "rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
        active && "scale-110",
      )}
    >
      <ColorSwatch colors={swatchColors(def, resolved)} active={active} />
    </button>
  )
}

// ─── Mode toggle (light / system / dark) ─────────────────────────────────────
// A dense 3-segment control, orthogonal to the color swatches. "System" is
// reachable directly (not hidden behind a double-tap) so "follow OS" is a
// first-class choice. Theme-tokened, no raw palette.

const MODE_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof SunIcon }[] = [
  { mode: "light", label: "Light", Icon: SunIcon },
  { mode: "system", label: "Follow system", Icon: MonitorIcon },
  { mode: "dark", label: "Dark", Icon: MoonIcon },
]

function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      {MODE_OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setMode(m)}
            className={cn(
              "grid size-6 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Theme picker. Two variants:
 *   - "inline"  (default): 7-swatch row + a mode toggle. Use where horizontal
 *     space is available (home page, showcase exhibit).
 *   - "compact": single current-theme swatch that opens a popover with the
 *     swatch grid AND the light/dark/system toggle. Use in tight chrome
 *     headers — survives narrow widths without overflow.
 *
 * In both variants a swatch is always the visible affordance, never a bare
 * palette icon: the swatch IS the picker's identity at every width. The swatch
 * previews the CURRENT mode's surface (light paper vs dark void).
 */
export function ThemePicker({
  className,
  variant = "inline",
}: {
  className?: string
  variant?: "inline" | "compact"
}) {
  const { theme, setTheme, current, themes, resolvedMode } = useTheme()

  if (variant === "compact") {
    return (
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Change theme and appearance"
              title="Change theme and appearance"
              className={cn(
                "grid size-6 place-items-center rounded-full transition-transform hover:scale-110",
                className,
              )}
            >
              <ColorSwatch colors={swatchColors(current, resolvedMode)} />
            </button>
          }
        />
        <PopoverContent align="end" className="w-auto p-2.5">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5 max-w-[9.5rem]">
              {themes.map((t) => (
                <ThemeSwatch
                  key={t.className}
                  def={t}
                  active={theme === t.className}
                  resolved={resolvedMode}
                  onClick={() => setTheme(t.className)}
                />
              ))}
            </div>
            <div className="border-t border-border pt-2">
              <ModeToggle className="w-full justify-between" />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex items-center gap-1.5">
        {themes.map((t) => (
          <ThemeSwatch
            key={t.className}
            def={t}
            active={theme === t.className}
            resolved={resolvedMode}
            onClick={() => setTheme(t.className)}
          />
        ))}
      </div>
      <div className="h-4 w-px bg-border" />
      <ModeToggle />
    </div>
  )
}

/**
 * Full theme picker with labels — for settings pages or the layout picker.
 * Leads with the light/dark/system toggle, then the labelled envelope list.
 */
export function ThemePickerExpanded({ className }: { className?: string }) {
  const { theme, setTheme, themes, resolvedMode } = useTheme()

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Appearance
        </span>
        <ModeToggle />
      </div>
      {themes.map((t) => (
        <button
          key={t.className}
          type="button"
          onClick={() => setTheme(t.className)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
            "hover:bg-secondary",
            theme === t.className
              ? "bg-secondary ring-1 ring-primary/30"
              : "bg-transparent",
          )}
        >
          <ColorSwatch
            colors={swatchColors(t, resolvedMode)}
            size="sm"
            active={theme === t.className}
          />
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs font-medium truncate">{t.label}</span>
            <span className="text-[10px] text-muted-foreground truncate">
              {t.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
