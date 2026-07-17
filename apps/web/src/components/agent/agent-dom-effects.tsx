import { useEffect } from "react"
import {
  AGENT_DOM_COMMAND_EVENT,
  isAgentDomCommand,
  normalizeAgentDomCommand,
  type AgentDomCommandEventDetail,
  type AgentDomScroll,
} from "@/lib/agent-dom-effects"

const ACTIVE_ATTRIBUTE = "data-agent-emphasis-active"
const EFFECT_ATTRIBUTE = "data-agent-emphasis-effect"
const DIMMING_ATTRIBUTE = "data-agent-dom-effects-dimming"

const styles = `
  [data-agent-target][${ACTIVE_ATTRIBUTE}="true"] {
    outline: 2px solid color-mix(in srgb, var(--primary) 78%, transparent);
    outline-offset: 3px;
    transition: opacity 160ms ease, outline-color 160ms ease, box-shadow 160ms ease;
  }

  [data-agent-target][${EFFECT_ATTRIBUTE}~="focus"] {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  [data-agent-target][${EFFECT_ATTRIBUTE}~="pulse"] {
    animation: sigil-agent-dom-pulse 900ms ease-in-out infinite alternate;
  }

  [data-agent-target][${EFFECT_ATTRIBUTE}~="trace"] {
    outline-style: dashed;
    animation: sigil-agent-dom-trace 700ms linear infinite;
  }

  [${DIMMING_ATTRIBUTE}="true"] [data-agent-target]:not([${ACTIVE_ATTRIBUTE}="true"]) {
    opacity: 0.32;
    transition: opacity 160ms ease;
  }

  @keyframes sigil-agent-dom-pulse {
    from {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 28%, transparent);
    }
    to {
      box-shadow: 0 0 0 9px color-mix(in srgb, var(--primary) 8%, transparent);
    }
  }

  @keyframes sigil-agent-dom-trace {
    from { outline-offset: 2px; }
    to { outline-offset: 7px; }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-agent-target][${ACTIVE_ATTRIBUTE}="true"],
    [${DIMMING_ATTRIBUTE}="true"] [data-agent-target] {
      animation: none !important;
      transition: none !important;
    }
  }
`

function findTargets(targetIds: string[]): HTMLElement[] {
  const wanted = new Set(targetIds)
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-agent-target]"),
  ).filter((element) => {
    const targetId = element.dataset.agentTarget
    return targetId !== undefined && wanted.has(targetId)
  })
}

function scrollTarget(element: HTMLElement, scroll: AgentDomScroll) {
  if (scroll === "none") return

  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: scroll === "center" ? "center" : "nearest",
    inline: "nearest",
  })
}

/**
 * Mount once near the application root to translate validated semantic target
 * commands into temporary DOM emphasis. It intentionally accepts no selectors
 * or markup and removes all effects on replacement, timeout, or unmount.
 */
export function AgentDomEffects() {
  useEffect(() => {
    interface ActiveApplication {
      effect: string
      targets: HTMLElement[]
      timeout?: ReturnType<typeof setTimeout>
    }

    const applications = new Set<ActiveApplication>()
    const touchedTargets = new Set<HTMLElement>()

    const clear = () => {
      for (const application of applications) {
        if (application.timeout !== undefined) {
          clearTimeout(application.timeout)
        }
      }
      applications.clear()

      for (const target of touchedTargets) {
        target.removeAttribute(ACTIVE_ATTRIBUTE)
        target.removeAttribute(EFFECT_ATTRIBUTE)
      }
      touchedTargets.clear()
      document.documentElement.removeAttribute(DIMMING_ATTRIBUTE)
    }

    const syncTargets = (targets: Iterable<HTMLElement>) => {
      for (const target of targets) {
        const effects = new Set<string>()
        for (const application of applications) {
          if (application.targets.includes(target)) {
            effects.add(application.effect)
          }
        }

        if (effects.size === 0) {
          target.removeAttribute(ACTIVE_ATTRIBUTE)
          target.removeAttribute(EFFECT_ATTRIBUTE)
          touchedTargets.delete(target)
        } else {
          target.setAttribute(ACTIVE_ATTRIBUTE, "true")
          target.setAttribute(EFFECT_ATTRIBUTE, [...effects].join(" "))
          touchedTargets.add(target)
        }
      }

      const isDimming = [...applications].some(
        (application) => application.effect === "dim-others",
      )
      if (isDimming) {
        document.documentElement.setAttribute(DIMMING_ATTRIBUTE, "true")
      } else {
        document.documentElement.removeAttribute(DIMMING_ATTRIBUTE)
      }
    }

    const applyCommands = (
      commands: Parameters<typeof normalizeAgentDomCommand>[0][],
      clearPrevious: boolean,
    ) => {
      if (clearPrevious) clear()

      let scrollCandidate:
        | { target: HTMLElement; scroll: AgentDomScroll }
        | undefined

      for (const rawCommand of commands) {
        if (!isAgentDomCommand(rawCommand)) continue
        const command = normalizeAgentDomCommand(rawCommand)
        const targets = findTargets(command.targetIds)
        if (targets.length === 0) continue

        const application: ActiveApplication = {
          effect: command.effect,
          targets,
        }
        applications.add(application)
        for (const target of targets) touchedTargets.add(target)

        if (!scrollCandidate && command.scroll !== "none") {
          scrollCandidate = {
            target: targets[0],
            scroll: command.scroll ?? "nearest",
          }
        }

        application.timeout = setTimeout(() => {
          applications.delete(application)
          syncTargets(application.targets)
        }, command.durationMs)
      }

      syncTargets(touchedTargets)
      if (scrollCandidate) {
        scrollTarget(scrollCandidate.target, scrollCandidate.scroll)
      }
    }

    const handleCommand = (event: Event) => {
      const detail = (event as CustomEvent<AgentDomCommandEventDetail>).detail
      if (!detail || detail.action === "clear") {
        clear()
        return
      }
      if (detail.action === "apply-batch") {
        applyCommands(detail.commands, detail.clearPrevious)
        return
      }
      applyCommands([detail.command], true)
    }

    window.addEventListener(AGENT_DOM_COMMAND_EVENT, handleCommand)
    return () => {
      window.removeEventListener(AGENT_DOM_COMMAND_EVENT, handleCommand)
      clear()
    }
  }, [])

  return <style data-slot="agent-dom-effects">{styles}</style>
}
