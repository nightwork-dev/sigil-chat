/**
 * Theme system for the material language design tokens.
 *
 * Two orthogonal axes:
 *   1. THEME  — which thermal envelope (amber, copper, midnight, …). A
 *      `theme-*` CSS class on <html>. Persisted under the "theme" key.
 *   2. MODE   — light | dark | system. A `.light` OR `.dark` marker class on
 *      <html>, sitting on top of the envelope. Persisted under "theme-mode".
 *      "system" follows the OS `prefers-color-scheme` live.
 *
 * The two combine: `<html class="theme-amber dark">` is dark amber (default),
 * `<html class="theme-amber light">` is light amber. Every envelope defines its
 * dark tokens in `.theme-*` and its light overrides in `.theme-*.light`.
 *
 * Architecture:
 *   - The UI package (globals.css) defines token SLOTS with default values and
 *     the `dark` custom variant (`&:is(.dark *)`).
 *   - The app (themes.css) defines envelope CLASSES (dark) + `.light` overrides.
 *   - This module manages which classes are applied to <html>.
 *   - `.dark` is present in dark mode (so `dark:` variants fire) and REMOVED in
 *     light mode (so they correctly turn off); `.light` replaces it.
 *
 * No-flash: a blocking inline script in __root.tsx sets the correct classes
 * pre-paint from localStorage + matchMedia. This module re-syncs on mount and
 * subscribes to OS changes when mode is "system".
 *
 * Usage:
 *   const { theme, setTheme, mode, setMode, resolvedMode } = useTheme()
 */

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useHotkey } from "@tanstack/react-hotkeys"

// ─── Theme definitions ──────────────────────────────────────────────────────
// `void` = the dark-mode background chip; `paper` = the light-mode background
// chip; `signal` = the envelope's identity accent (shown in both modes). These
// three drive the theme-picker swatches; they are display data, not chrome.

export const THEMES = [
  {
    className: "theme-amber",
    label: "Amber",
    description: "Precision instrument in a dark room",
    signal: "#d4a853",
    void: "#0d0b0f",
    paper: "#f0e9db",
  },
  {
    className: "theme-copper",
    label: "Copper",
    description: "Oxidized metal under workshop light",
    signal: "#c67a4b",
    void: "#0f0b0d",
    paper: "#f1e8e1",
  },
  {
    className: "theme-midnight",
    label: "Midnight",
    description: "Cool instrument panel, silver text",
    signal: "#5ba8c4",
    void: "#0a0d12",
    paper: "#e7ecf2",
  },
  {
    className: "theme-rose-gold",
    label: "Rose Gold",
    description: "Luxury register, soft metallic pink",
    signal: "#c4887a",
    void: "#0e0b10",
    paper: "#f3e9ec",
  },
  {
    className: "theme-jade",
    label: "Jade",
    description: "Organic signal in inorganic surfaces",
    signal: "#53b88a",
    void: "#0b0c10",
    paper: "#e8efe9",
  },
  {
    className: "theme-bone",
    label: "Bone",
    description: "Aged paper, museum lighting, quiet",
    signal: "#a89878",
    void: "#0f0d0b",
    paper: "#f1ede3",
  },
  {
    className: "theme-ultraviolet",
    label: "Ultraviolet",
    description: "Purple corridor turned up loud",
    signal: "#d4aa48",
    void: "#0e0a12",
    paper: "#ece7f3",
  },
] as const

export type ThemeDef = (typeof THEMES)[number]
export type ThemeClassName = ThemeDef["className"]

export const DEFAULT_THEME: ThemeClassName = "theme-amber"

// ─── Mode (light / dark / system) ───────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedMode = "light" | "dark"

export const DEFAULT_MODE: ThemeMode = "system"
/** SSR renders the dark default; the inline no-flash script upgrades pre-paint. */
export const DEFAULT_RESOLVED_MODE: ResolvedMode = "dark"

const THEME_CLASSNAMES = THEMES.map((t) => t.className) as readonly string[]

// ─── Persistence ────────────────────────────────────────────────────────────

const STORAGE_KEY = "theme"
const MODE_STORAGE_KEY = "theme-mode"

function getStoredTheme(): ThemeClassName {
  if (typeof window === "undefined") return DEFAULT_THEME
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEME_CLASSNAMES.includes(stored)) {
      return stored as ThemeClassName
    }
  } catch {
    // SSR or localStorage unavailable
  }
  return DEFAULT_THEME
}

function setStoredTheme(theme: ThemeClassName): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage unavailable
  }
}

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_MODE
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored
    }
  } catch {
    // SSR or localStorage unavailable
  }
  return DEFAULT_MODE
}

function setStoredMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // localStorage unavailable
  }
}

// ─── Theme store (for useSyncExternalStore) ─────────────────────────────────
// This lets the theme update immediately across all consumers without
// re-rendering the entire tree via context. The context provides the API;
// the store provides the reactivity.

let currentTheme: ThemeClassName = DEFAULT_THEME
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ThemeClassName {
  return currentTheme
}

function getServerSnapshot(): ThemeClassName {
  return DEFAULT_THEME
}

function applyTheme(next: ThemeClassName): void {
  if (next === currentTheme) return
  const prev = currentTheme
  currentTheme = next

  // Swap the envelope class on <html>
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(prev)
    document.documentElement.classList.add(next)
  }

  setStoredTheme(next)
  listeners.forEach((fn) => fn())
}

// ─── Mode store ──────────────────────────────────────────────────────────────
// A second, independent store for the light/dark/system axis. Snapshot is a
// cached object so useSyncExternalStore sees a stable reference between changes
// (rebuilding it on every getSnapshot would loop).

interface ModeSnapshot {
  mode: ThemeMode
  resolvedMode: ResolvedMode
}

let currentMode: ThemeMode = DEFAULT_MODE
let currentResolved: ResolvedMode = DEFAULT_RESOLVED_MODE
let modeSnapshot: ModeSnapshot = { mode: currentMode, resolvedMode: currentResolved }
const SERVER_MODE_SNAPSHOT: ModeSnapshot = {
  mode: DEFAULT_MODE,
  resolvedMode: DEFAULT_RESOLVED_MODE,
}
const modeListeners = new Set<() => void>()

function subscribeMode(listener: () => void): () => void {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

function getModeSnapshot(): ModeSnapshot {
  return modeSnapshot
}

function getModeServerSnapshot(): ModeSnapshot {
  return SERVER_MODE_SNAPSHOT
}

function systemPrefersLight(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-color-scheme: light)").matches
}

function computeResolved(mode: ThemeMode): ResolvedMode {
  if (mode === "system") return systemPrefersLight() ? "light" : "dark"
  return mode
}

/** Toggle the .light / .dark marker classes on <html> to match `resolved`. */
function applyResolvedClass(resolved: ResolvedMode): void {
  if (typeof document === "undefined") return
  const el = document.documentElement
  if (resolved === "light") {
    el.classList.add("light")
    el.classList.remove("dark")
  } else {
    el.classList.add("dark")
    el.classList.remove("light")
  }
}

// ─── System-preference subscription (legitimate external store) ──────────────
// Only active while mode === "system". Following the OS live is an external
// event source, so an addEventListener/cleanup pair is the correct tool here
// (not derived state).

let mql: MediaQueryList | null = null
let mqlHandler: (() => void) | null = null

function syncSystemListener(): void {
  if (typeof window === "undefined" || !window.matchMedia) return
  if (currentMode === "system") {
    if (!mql) {
      mql = window.matchMedia("(prefers-color-scheme: light)")
      mqlHandler = () => {
        currentResolved = computeResolved("system")
        modeSnapshot = { mode: currentMode, resolvedMode: currentResolved }
        applyResolvedClass(currentResolved)
        modeListeners.forEach((fn) => fn())
      }
      mql.addEventListener("change", mqlHandler)
    }
  } else if (mql && mqlHandler) {
    mql.removeEventListener("change", mqlHandler)
    mql = null
    mqlHandler = null
  }
}

function applyMode(next: ThemeMode, persist: boolean): void {
  currentMode = next
  currentResolved = computeResolved(next)
  modeSnapshot = { mode: currentMode, resolvedMode: currentResolved }
  applyResolvedClass(currentResolved)
  if (persist) setStoredMode(next)
  syncSystemListener()
  modeListeners.forEach((fn) => fn())
}

/** Call once on client mount to sync stored theme + mode → DOM. */
export function initTheme(): void {
  if (typeof document === "undefined") return

  const el = document.documentElement
  // Suppress the color transition on the first frame.
  el.classList.add("no-transition")

  // Envelope: clear any stale theme class, apply the stored one.
  currentTheme = getStoredTheme()
  THEME_CLASSNAMES.forEach((c) => el.classList.remove(c))
  el.classList.add(currentTheme)
  listeners.forEach((fn) => fn())

  // Mode: apply stored mode + resolved light/dark class, attach system listener.
  // The inline no-flash script already set matching classes pre-paint, so this
  // re-sync causes no visible change — it just aligns the store + subscription.
  applyMode(getStoredMode(), false)

  // Re-enable transitions after one frame.
  requestAnimationFrame(() => {
    el.classList.remove("no-transition")
  })
}

// ─── Context ────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  setTheme: (theme: ThemeClassName) => void
  setMode: (mode: ThemeMode) => void
  themes: typeof THEMES
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value: ThemeContextValue = {
    setTheme: applyTheme,
    setMode: (mode) => applyMode(mode, true),
    themes: THEMES,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>")
  }

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const modeState = useSyncExternalStore(
    subscribeMode,
    getModeSnapshot,
    getModeServerSnapshot,
  )

  const setTheme = useCallback(
    (next: ThemeClassName) => ctx.setTheme(next),
    [ctx],
  )
  const setMode = useCallback((next: ThemeMode) => ctx.setMode(next), [ctx])

  const currentDef = THEMES.find((t) => t.className === theme) ?? THEMES[0]

  return {
    /** Current theme CSS class name */
    theme,
    /** Current theme definition with label, description, preview colors */
    current: currentDef,
    /** Set the active theme. Persists to localStorage and updates DOM immediately. */
    setTheme,
    /** All available theme definitions */
    themes: ctx.themes,
    /** Current mode preference: "light" | "dark" | "system" */
    mode: modeState.mode,
    /** Resolved appearance after applying "system": "light" | "dark" */
    resolvedMode: modeState.resolvedMode,
    /** Set the mode. Persists and applies the .light/.dark class immediately. */
    setMode,
  } as const
}

// ─── Cycles (for keyboard shortcuts) ────────────────────────────────────────

export function cycleTheme(): void {
  const idx = THEMES.findIndex((t) => t.className === currentTheme)
  const next = THEMES[(idx + 1) % THEMES.length]
  applyTheme(next.className)
}

/** dark → light → system → dark. Keeps "follow system" reachable from the key. */
export function cycleMode(): void {
  const order: ThemeMode[] = ["dark", "light", "system"]
  const idx = order.indexOf(currentMode)
  const next = order[(idx + 1) % order.length]!
  applyMode(next, true)
}

// ─── Keyboard shortcut hooks ────────────────────────────────────────────────

/** Register Mod+Shift+T (Cmd on Mac, Ctrl on Win/Linux) to cycle themes */
export function useThemeShortcut(): void {
  useHotkey("Mod+Shift+T", cycleTheme, {
    meta: { name: "Cycle theme" },
  })
}

/** Register Mod+Shift+L to cycle light/dark/system */
export function useModeShortcut(): void {
  useHotkey("Mod+Shift+L", cycleMode, {
    meta: { name: "Cycle light/dark" },
  })
}

// ─── Utility: SSR class + no-flash inline script ────────────────────────────
// SSR always renders the dark default; the inline script (below) corrects the
// classes pre-paint from localStorage + matchMedia so there is no flash.

export function getSSRThemeClass(): string {
  return `dark ${DEFAULT_THEME}`
}

/**
 * A blocking inline script for <head>. Runs before first paint: reads the
 * stored theme + mode and the OS preference, then sets the correct classes on
 * <html> so a system-light user never sees a dark flash. Kept dependency-free
 * and defensive (try/catch) because it runs before the bundle loads.
 */
export const NO_FLASH_SCRIPT = `(function(){try{
var d=document.documentElement;
var themes=${JSON.stringify(THEME_CLASSNAMES)};
var t=localStorage.getItem('${STORAGE_KEY}');
if(t&&themes.indexOf(t)>-1){themes.forEach(function(c){d.classList.remove(c)});d.classList.add(t);}
var m=localStorage.getItem('${MODE_STORAGE_KEY}')||'${DEFAULT_MODE}';
var light=m==='light'||(m==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);
if(light){d.classList.add('light');d.classList.remove('dark');}else{d.classList.add('dark');d.classList.remove('light');}
}catch(e){}})();`
