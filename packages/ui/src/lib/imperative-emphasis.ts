// Framework-agnostic engine behind imperative, fire-and-forget DOM emphasis:
// flash 1–50 elements addressed by an opaque id string, with transient
// self-expiring timers and focus/pulse/trace/dim-others effects. This is
// deliberately NOT the same primitive as SpotlightScrim (lib/spotlight-focus.ts)
// — that is a declarative single-target modal scrim with a focus trap that
// persists until dismissed. This engine never traps focus and never persists;
// every application it makes is invalidated by a new command, a timeout, or
// `clear()`. The Sigil Design ingress-core contract defines
// the extraction rationale (ported from sigil-chat's `agent-dom-effects`).
//
// The target-attribute name and the DOM event name are both configurable so a
// consumer can preserve an existing wire contract (e.g. sigil-chat keeps
// `data-agent-target` / `sigil:agent-dom-command`) while this module owns none
// of that naming itself.

export const emphasisEffects = ["focus", "pulse", "trace", "dim-others"] as const

export type EmphasisEffect = (typeof emphasisEffects)[number]

export type EmphasisScroll = "none" | "nearest" | "center"

export interface EmphasisCommand {
  targetIds: string[]
  effect: EmphasisEffect
  durationMs?: number
  scroll?: EmphasisScroll
}

export interface EmphasisBatchOptions {
  clearPrevious?: boolean
}

export const MIN_EMPHASIS_DURATION_MS = 300
export const MAX_EMPHASIS_DURATION_MS = 10_000
export const DEFAULT_EMPHASIS_DURATION_MS = 2_500

export const DEFAULT_EMPHASIS_TARGET_ATTRIBUTE = "data-emphasis-target"
export const DEFAULT_EMPHASIS_EVENT = "sigil:emphasis-command"

const TARGET_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,127}$/

export function isEmphasisTargetId(value: unknown): value is string {
  return typeof value === "string" && TARGET_ID_PATTERN.test(value)
}

export function isEmphasisEffect(value: unknown): value is EmphasisEffect {
  return (
    typeof value === "string" &&
    (emphasisEffects as readonly string[]).includes(value)
  )
}

export function isEmphasisCommand(value: unknown): value is EmphasisCommand {
  if (!value || typeof value !== "object") return false
  const command = value as Record<string, unknown>

  return (
    Array.isArray(command.targetIds) &&
    command.targetIds.length > 0 &&
    command.targetIds.length <= 50 &&
    command.targetIds.every(isEmphasisTargetId) &&
    isEmphasisEffect(command.effect) &&
    (command.durationMs === undefined ||
      (typeof command.durationMs === "number" &&
        Number.isFinite(command.durationMs))) &&
    (command.scroll === undefined ||
      command.scroll === "none" ||
      command.scroll === "nearest" ||
      command.scroll === "center")
  )
}

/** Dedupes target ids and clamps `durationMs` to [300ms, 10s] (default 2.5s). */
export function normalizeEmphasisCommand(
  command: EmphasisCommand,
): Required<Pick<EmphasisCommand, "targetIds" | "effect" | "durationMs" | "scroll">> {
  return {
    targetIds: [...new Set(command.targetIds)],
    effect: command.effect,
    durationMs: Math.min(
      MAX_EMPHASIS_DURATION_MS,
      Math.max(MIN_EMPHASIS_DURATION_MS, command.durationMs ?? DEFAULT_EMPHASIS_DURATION_MS),
    ),
    scroll: command.scroll ?? "nearest",
  }
}

/** Throws on an invalid id — call sites never hand the engine a CSS selector. */
export function getEmphasisTargetProps(
  targetId: string,
  targetAttribute: string = DEFAULT_EMPHASIS_TARGET_ATTRIBUTE,
): Record<string, string> {
  if (!isEmphasisTargetId(targetId)) {
    throw new Error(
      `Invalid emphasis target id "${targetId}". Use a stable id containing only letters, numbers, colon, period, underscore, slash, or hyphen.`,
    )
  }
  return { [targetAttribute]: targetId }
}

export interface EmphasisEngineOptions {
  /** Attribute used to find and address elements, e.g. "data-agent-target". */
  targetAttribute?: string
  /** Attribute toggled "true" while an element carries any active emphasis. */
  activeAttribute?: string
  /** Attribute holding the space-separated list of active effect names. */
  effectAttribute?: string
  /** Attribute toggled "true" on the document root while `dim-others` is active. */
  dimmingAttribute?: string
}

interface ActiveApplication {
  effect: EmphasisEffect
  targets: HTMLElement[]
  timeout?: ReturnType<typeof setTimeout>
}

/**
 * Owns the live application state: the timer-backed set of currently active
 * commands, the attribute toggling that reflects them onto the DOM, and the
 * dim-others root flag. One instance is meant to be mounted once (see the
 * `<EmphasisEffects>` component in `components/effects/imperative-emphasis`);
 * this class has no React dependency so it can be constructed and driven from
 * plain code or a test.
 */
export class EmphasisEngine {
  private readonly targetAttribute: string
  private readonly activeAttribute: string
  private readonly effectAttribute: string
  private readonly dimmingAttribute: string
  private readonly applications = new Set<ActiveApplication>()
  private readonly touchedTargets = new Set<HTMLElement>()

  constructor(options: EmphasisEngineOptions = {}) {
    this.targetAttribute = options.targetAttribute ?? DEFAULT_EMPHASIS_TARGET_ATTRIBUTE
    this.activeAttribute = options.activeAttribute ?? "data-emphasis-active"
    this.effectAttribute = options.effectAttribute ?? "data-emphasis-effect"
    this.dimmingAttribute = options.dimmingAttribute ?? "data-emphasis-dimming"
  }

  private findTargets(targetIds: string[]): HTMLElement[] {
    const wanted = new Set(targetIds)
    return Array.from(
      document.querySelectorAll<HTMLElement>(`[${this.targetAttribute}]`),
    ).filter((element) => {
      const targetId = element.getAttribute(this.targetAttribute)
      return targetId !== null && wanted.has(targetId)
    })
  }

  private syncTargets(targets: Iterable<HTMLElement>) {
    for (const target of targets) {
      const effects = new Set<string>()
      for (const application of this.applications) {
        if (application.targets.includes(target)) {
          effects.add(application.effect)
        }
      }

      if (effects.size === 0) {
        target.removeAttribute(this.activeAttribute)
        target.removeAttribute(this.effectAttribute)
        this.touchedTargets.delete(target)
      } else {
        target.setAttribute(this.activeAttribute, "true")
        target.setAttribute(this.effectAttribute, [...effects].join(" "))
        this.touchedTargets.add(target)
      }
    }

    const isDimming = [...this.applications].some(
      (application) => application.effect === "dim-others",
    )
    if (isDimming) {
      document.documentElement.setAttribute(this.dimmingAttribute, "true")
    } else {
      document.documentElement.removeAttribute(this.dimmingAttribute)
    }
  }

  /** Cancels every pending timer, strips every toggled attribute, clears dimming. */
  clear() {
    for (const application of this.applications) {
      if (application.timeout !== undefined) clearTimeout(application.timeout)
    }
    this.applications.clear()

    for (const target of this.touchedTargets) {
      target.removeAttribute(this.activeAttribute)
      target.removeAttribute(this.effectAttribute)
    }
    this.touchedTargets.clear()
    document.documentElement.removeAttribute(this.dimmingAttribute)
  }

  /**
   * Applies a batch of commands. Invalid commands (fails `isEmphasisCommand`)
   * or commands with zero live targets are silently skipped. Returns the first
   * scroll target/behavior requested (if any), for the caller to act on.
   */
  applyCommands(
    commands: EmphasisCommand[],
    clearPrevious: boolean,
  ): { target: HTMLElement; scroll: EmphasisScroll } | undefined {
    if (clearPrevious) this.clear()

    let scrollCandidate: { target: HTMLElement; scroll: EmphasisScroll } | undefined

    for (const rawCommand of commands) {
      if (!isEmphasisCommand(rawCommand)) continue
      const command = normalizeEmphasisCommand(rawCommand)
      const targets = this.findTargets(command.targetIds)
      if (targets.length === 0) continue

      const application: ActiveApplication = { effect: command.effect, targets }
      this.applications.add(application)
      for (const target of targets) this.touchedTargets.add(target)

      if (!scrollCandidate && command.scroll !== "none") {
        scrollCandidate = { target: targets[0], scroll: command.scroll }
      }

      application.timeout = setTimeout(() => {
        this.applications.delete(application)
        this.syncTargets(application.targets)
      }, command.durationMs)
    }

    this.syncTargets(this.touchedTargets)
    return scrollCandidate
  }

  /** Cancels timers and clears all attributes — call from an unmount cleanup. */
  destroy() {
    this.clear()
  }
}

/** Parameterized CSS for the four effects plus the reduced-motion guard. */
export function getEmphasisStyles(options: EmphasisEngineOptions = {}): string {
  const targetAttribute = options.targetAttribute ?? DEFAULT_EMPHASIS_TARGET_ATTRIBUTE
  const activeAttribute = options.activeAttribute ?? "data-emphasis-active"
  const effectAttribute = options.effectAttribute ?? "data-emphasis-effect"
  const dimmingAttribute = options.dimmingAttribute ?? "data-emphasis-dimming"

  return `
  [${targetAttribute}][${activeAttribute}="true"] {
    outline: 2px solid color-mix(in srgb, var(--primary) 78%, transparent);
    outline-offset: 3px;
    transition: opacity 160ms ease, outline-color 160ms ease, box-shadow 160ms ease;
  }

  [${targetAttribute}][${effectAttribute}~="focus"] {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  [${targetAttribute}][${effectAttribute}~="pulse"] {
    animation: sigil-emphasis-pulse 900ms ease-in-out infinite alternate;
  }

  [${targetAttribute}][${effectAttribute}~="trace"] {
    outline-style: dashed;
    animation: sigil-emphasis-trace 700ms linear infinite;
  }

  [${dimmingAttribute}="true"] [${targetAttribute}]:not([${activeAttribute}="true"]) {
    opacity: 0.32;
    transition: opacity 160ms ease;
  }

  @keyframes sigil-emphasis-pulse {
    from {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 28%, transparent);
    }
    to {
      box-shadow: 0 0 0 9px color-mix(in srgb, var(--primary) 8%, transparent);
    }
  }

  @keyframes sigil-emphasis-trace {
    from { outline-offset: 2px; }
    to { outline-offset: 7px; }
  }

  @media (prefers-reduced-motion: reduce) {
    [${targetAttribute}][${activeAttribute}="true"],
    [${dimmingAttribute}="true"] [${targetAttribute}] {
      animation: none !important;
      transition: none !important;
    }
  }
`
}

export function scrollToEmphasisTarget(element: HTMLElement, scroll: EmphasisScroll) {
  if (scroll === "none") return
  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: scroll === "center" ? "center" : "nearest",
    inline: "nearest",
  })
}

export type EmphasisCommandEventDetail =
  | { action: "apply"; command: EmphasisCommand }
  | { action: "apply-batch"; commands: EmphasisCommand[]; clearPrevious: boolean }
  | { action: "clear" }

export interface EmphasisDispatchOptions {
  /** DOM event name to dispatch on `window`. Must match the mounted engine's `eventName`. */
  eventName?: string
}

export function emphasize(
  command: EmphasisCommand,
  options: EmphasisDispatchOptions = {},
): boolean {
  if (typeof window === "undefined" || !isEmphasisCommand(command)) return false

  window.dispatchEvent(
    new CustomEvent<EmphasisCommandEventDetail>(
      options.eventName ?? DEFAULT_EMPHASIS_EVENT,
      { detail: { action: "apply", command: normalizeEmphasisCommand(command) } },
    ),
  )
  return true
}

export function emphasizeBatch(
  commands: EmphasisCommand[],
  options: EmphasisBatchOptions & EmphasisDispatchOptions = {},
): boolean {
  if (
    typeof window === "undefined" ||
    commands.length === 0 ||
    commands.length > 50 ||
    !commands.every(isEmphasisCommand)
  ) {
    return false
  }

  window.dispatchEvent(
    new CustomEvent<EmphasisCommandEventDetail>(
      options.eventName ?? DEFAULT_EMPHASIS_EVENT,
      {
        detail: {
          action: "apply-batch",
          commands: commands.map(normalizeEmphasisCommand),
          clearPrevious: options.clearPrevious ?? true,
        },
      },
    ),
  )
  return true
}

export function clearEmphasis(options: EmphasisDispatchOptions = {}): boolean {
  if (typeof window === "undefined") return false

  window.dispatchEvent(
    new CustomEvent<EmphasisCommandEventDetail>(options.eventName ?? DEFAULT_EMPHASIS_EVENT, {
      detail: { action: "clear" },
    }),
  )
  return true
}
