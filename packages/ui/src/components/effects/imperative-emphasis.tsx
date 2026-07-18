import { useEffect } from "react"

import {
  DEFAULT_EMPHASIS_EVENT,
  DEFAULT_EMPHASIS_TARGET_ATTRIBUTE,
  EmphasisEngine,
  getEmphasisStyles,
  scrollToEmphasisTarget,
  type EmphasisCommand,
  type EmphasisCommandEventDetail,
} from "@workspace/ui/lib/imperative-emphasis"

export interface EmphasisEffectsProps {
  /** Attribute elements carry to opt into being an addressable target. */
  targetAttribute?: string
  /** DOM event name this instance listens for on `window`. */
  eventName?: string
}

/**
 * Mount once near the application root to translate validated emphasis
 * commands (dispatched via `emphasize`/`emphasizeBatch`/`clearEmphasis`) into
 * temporary DOM attribute toggling + injected CSS. Accepts no selectors or
 * markup — only opaque target ids — and removes every effect on timeout,
 * replacement, or unmount. `targetAttribute`/`eventName` let a consumer keep
 * an existing wire contract (e.g. `data-agent-target` / `sigil:agent-dom-command`)
 * without this module knowing that naming.
 */
export function EmphasisEffects({
  targetAttribute = DEFAULT_EMPHASIS_TARGET_ATTRIBUTE,
  eventName = DEFAULT_EMPHASIS_EVENT,
}: EmphasisEffectsProps = {}) {
  useEffect(() => {
    const engine = new EmphasisEngine({ targetAttribute })

    const handleCommand = (event: Event) => {
      const detail = (event as CustomEvent<EmphasisCommandEventDetail>).detail
      if (!detail || detail.action === "clear") {
        engine.clear()
        return
      }

      const commands: EmphasisCommand[] =
        detail.action === "apply-batch" ? detail.commands : [detail.command]
      const clearPrevious = detail.action === "apply-batch" ? detail.clearPrevious : true

      const scrollCandidate = engine.applyCommands(commands, clearPrevious)
      if (scrollCandidate) {
        scrollToEmphasisTarget(scrollCandidate.target, scrollCandidate.scroll)
      }
    }

    window.addEventListener(eventName, handleCommand)
    return () => {
      window.removeEventListener(eventName, handleCommand)
      engine.destroy()
    }
  }, [targetAttribute, eventName])

  return <style data-slot="emphasis-effects">{getEmphasisStyles({ targetAttribute })}</style>
}
