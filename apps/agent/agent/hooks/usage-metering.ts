// MDL.3: capture usage at the seam MDL.2 built — Eve's `step.completed`
// event carries provider-reported token counts for the model call that just
// finished. The attribution logic (which preset/provider/model ran, which
// application thread and principal it belongs to) lives in
// `lib/usage-metering.ts` so it is unit-testable without a live hook context;
// this file is the wiring.
//
// Hooks are observe-only and fire after the event is durably written (see
// eve's hooks guide), so recording here cannot desync from what actually
// happened. A thrown handler would fail the user's turn, which usage
// accounting must never do — the whole body is wrapped so a metering failure
// degrades to "this turn went unrecorded, logged", never to a broken chat.

import { defineHook } from "eve/hooks"

import { loadSigilConfigFixture } from "@workspace/runtime-env/config"

import { usageLedgerRepository } from "../lib/application-services"
import { buildUsageAppendInput } from "../lib/usage-metering"

const { value: sigilConfig } = await loadSigilConfigFixture()

export default defineHook({
  events: {
    async "step.completed"(event, ctx) {
      try {
        const result = buildUsageAppendInput(event, ctx, sigilConfig.agent)
        if (result.kind === "skipped") {
          // Sessions that never completed the verified execution binding
          // (an eval harness run, a malformed replay) have nothing true to
          // attribute usage to. Silent skip: this is the ordinary shape for
          // anything outside the real web product, not an operator alert.
          return
        }
        usageLedgerRepository.append(result.input)
      } catch (error) {
        console.error(
          "[sigil] usage metering failed for a completed step; the turn is unaffected.",
          error,
        )
      }
    },
  },
})
