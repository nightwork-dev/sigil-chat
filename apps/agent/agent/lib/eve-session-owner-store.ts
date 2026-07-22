import {
  executionBindingFromCaller,
  principalSubject,
} from "./eve-auth"
import { MirkEveSessionOwnerStore } from "./eve-session-owners"
import type { EveSessionOwnerStore } from "./eve-session-owners"

/**
 * One host-process owner store shared by the Eve HTTP channel and connection
 * authorization. Gonk opens the same durable namespace in its own process.
 */
export const eveSessionOwnerStore = new MirkEveSessionOwnerStore()

export async function bindEveExecutionSession(
  input: {
    sessionId: string
    caller: Parameters<typeof executionBindingFromCaller>[0] | null
  },
  ownerStore: EveSessionOwnerStore = eveSessionOwnerStore,
) {
  if (!input.caller) throw new Error("Eve session has no authenticated caller.")
  const executionBinding = executionBindingFromCaller(input.caller)
  if (!executionBinding) {
    throw new Error("Eve session has no execution binding.")
  }
  await ownerStore.bind(
    input.sessionId,
    principalSubject(input.caller),
    executionBinding,
  )
}
