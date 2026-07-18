// Thin wrapper around @workspace/ui's generic imperative-emphasis engine,
// configured to keep this app's existing wire contract: the
// `data-agent-target` attribute and the `sigil:agent-dom-command` event. The
// load-bearing engine (attribute toggling, timers, CSS, reduced-motion guard)
// now lives in @workspace/ui/lib/imperative-emphasis +
// @workspace/ui/components/effects/imperative-emphasis — this file supplies
// no logic of its own.
import { EmphasisEffects } from "@workspace/ui/components/effects/imperative-emphasis"

import {
  AGENT_DOM_COMMAND_EVENT,
  AGENT_TARGET_ATTRIBUTE,
} from "@/lib/agent-dom-effects"

/**
 * Mount once near the application root to translate validated semantic target
 * commands into temporary DOM emphasis. It intentionally accepts no selectors
 * or markup and removes all effects on replacement, timeout, or unmount.
 */
export function AgentDomEffects() {
  return (
    <EmphasisEffects
      targetAttribute={AGENT_TARGET_ATTRIBUTE}
      eventName={AGENT_DOM_COMMAND_EVENT}
    />
  )
}
