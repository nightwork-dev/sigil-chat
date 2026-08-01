// The account's agent preferences — tool consent and spoken replies — with
// the user-settings registry as the source of truth.
//
// These used to be two localStorage stores that the registry was copied INTO
// once per account. The copy was the problem: two writers, one of them a
// component, and a rule ("adopt only a stored value, only once") that had to
// be right in a place nobody reading the settings page would look.
//
// Now the query IS the value. A component reads through the hooks below and
// writes through the mutations below; localStorage survives only as the
// pre-hydration mirror, written from this layer whenever the account's stored
// answer resolves, and read only until it does.
//
// A resolved `source: "default"` deliberately does NOT overwrite the mirror:
// "nobody has chosen" is not an answer, and it must not erase what this
// browser was last told.
//
// One thing the retired store did that this does not: it listened for the
// `storage` event, so a change in one tab reached its siblings immediately.
// Cross-tab agreement now arrives the same way every other query's does — on
// refetch — because the durable copy is what they share.

import { useCallback, useEffect, useMemo } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"

import {
  readSpeakRepliesMirror,
  writeSpeakRepliesMirror,
} from "./agent-speak-replies"
import {
  EMPTY_TOOL_APPROVAL_OVERRIDES,
  effectiveToolApprovalOverrides,
  normalizePerAgentOverrides,
  parseToolApprovalMode,
  readToolApprovalModeMirror,
  readToolApprovalOverridesMirror,
  serializeToolApprovalPreference,
  writeToolApprovalModeMirror,
  writeToolApprovalOverridesMirror,
  type PerAgentToolApprovalOverrides,
  type ToolApprovalMode,
} from "./agent-tool-approval"
import { useAgentPrincipalId } from "./agent-principal"
import {
  useSetUserSetting,
  useUserSetting,
  userSettingKeys,
  type UserSettingResult,
} from "./user-settings"
import type { SettingKey, SettingValue } from "./user-settings/registry"
import { useHydratedMirror } from "@/hooks/use-hydrated-mirror"

const TOOL_APPROVAL_DEFAULT_KEY = "agent.toolApprovalDefault"
const TOOL_APPROVAL_OVERRIDES_KEY = "agent.toolApprovalOverrides"
const SPEAK_REPLIES_KEY = "agent.speakReplies"

/**
 * The account's answer for one setting, or undefined while nobody has one.
 *
 * `source: "default"` means the registry fell back — no scope has stored a
 * value — so the caller keeps whatever the mirror holds instead.
 */
function storedValue<K extends SettingKey>(
  result: UserSettingResult<SettingValue<K>> | undefined,
): SettingValue<K> | undefined {
  if (!result || result.source === "default") return undefined
  return result.value
}

/**
 * Read one preference: the account's stored answer when it has resolved, the
 * pre-hydration mirror until then, and a write-through so the mirror is ready
 * for the next first paint.
 */
function useMirroredPreference<K extends SettingKey, T>(
  key: K,
  normalize: (value: SettingValue<K>) => T,
  readMirror: () => T,
  writeMirror: (value: T) => void,
  serverValue: T,
): T {
  const userId = useAgentPrincipalId()
  const query = useUserSetting(userId, key)
  const stored = storedValue<K>(query.data)
  // Referential stability, not caching: an overrides record re-normalized on
  // every render is a new object every render, which would re-run the mirror
  // write below and re-render every consumer that holds it.
  const resolved = useMemo(
    () => (stored === undefined ? undefined : normalize(stored)),
    // `normalize` is a module function; `stored` is React Query's own value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored],
  )
  const mirrored = useHydratedMirror(readMirror, serverValue)

  // Browser-boundary write, not derived state: the account's answer becomes
  // the value this browser paints with before any query runs next time.
  useEffect(() => {
    if (resolved !== undefined) writeMirror(resolved)
  }, [resolved, writeMirror])

  return resolved ?? mirrored
}

export function useToolApprovalMode(): ToolApprovalMode {
  return useMirroredPreference(
    TOOL_APPROVAL_DEFAULT_KEY,
    parseToolApprovalMode,
    readToolApprovalModeMirror,
    writeToolApprovalModeMirror,
    "ask",
  )
}

export function useToolApprovalOverrides(): PerAgentToolApprovalOverrides {
  return useMirroredPreference(
    TOOL_APPROVAL_OVERRIDES_KEY,
    normalizePerAgentOverrides,
    readToolApprovalOverridesMirror,
    writeToolApprovalOverridesMirror,
    EMPTY_TOOL_APPROVAL_OVERRIDES,
  )
}

export function useSpeakReplies(): boolean {
  return useMirroredPreference(
    SPEAK_REPLIES_KEY,
    (value) => value === true,
    readSpeakRepliesMirror,
    writeSpeakRepliesMirror,
    false,
  )
}

/** What every preference write returns: one setter and its in-flight state. */
export interface PreferenceWriter<T> {
  set: (next: T) => void
  isPending: boolean
}

/**
 * Write one preference: the mirror and the query cache take the new value at
 * once so the surface that made the change reflects it without waiting for
 * the round trip, and the registry write follows.
 */
function useWritePreference<K extends SettingKey, T>(
  key: K,
  toStored: (next: T) => SettingValue<K>,
  writeMirror: (next: T) => void,
  options: { withExpectedRevision: boolean },
): PreferenceWriter<T> {
  const userId = useAgentPrincipalId()
  const queryClient = useQueryClient()
  const current = useUserSetting(userId, key)
  const mutation = useSetUserSetting(userId, key)

  return {
    isPending: mutation.isPending,
    set(next: T) {
      const value = toStored(next)
      writeMirror(next)
      queryClient.setQueryData<UserSettingResult<SettingValue<K>>>(
        userSettingKeys.detail(userId, key),
        (previous) => ({
          value,
          source: "user",
          revision: previous?.revision ?? null,
        }),
      )
      mutation.mutate({
        scopeKind: "user",
        scopeId: "",
        value,
        expectedRevision: options.withExpectedRevision
          ? (current.data?.revision ?? undefined)
          : undefined,
      })
    },
  }
}

export function useSetToolApprovalMode(): PreferenceWriter<ToolApprovalMode> {
  return useWritePreference(
    TOOL_APPROVAL_DEFAULT_KEY,
    (next) => next,
    writeToolApprovalModeMirror,
    { withExpectedRevision: true },
  )
}

export function useSetToolApprovalOverrides(): PreferenceWriter<PerAgentToolApprovalOverrides> {
  return useWritePreference(
    TOOL_APPROVAL_OVERRIDES_KEY,
    (next) => next,
    writeToolApprovalOverridesMirror,
    // Per-tool switches are flipped in bursts; a revision check here would
    // reject the second flip against the first one's un-refetched revision.
    { withExpectedRevision: false },
  )
}

export function useSetSpeakReplies(): PreferenceWriter<boolean> {
  return useWritePreference(
    SPEAK_REPLIES_KEY,
    (next) => next,
    writeSpeakRepliesMirror,
    { withExpectedRevision: true },
  )
}

/**
 * The tool-approval header value, read synchronously.
 *
 * The header is built inside `send`, where there is no render to await a
 * query in — so this reads the query cache directly
 * (`queryClient.getQueryData` is synchronous) and falls back to the mirror
 * when the cache has no answer yet. The serialized shape is Eve's parse
 * contract and does not change.
 */
export function toolApprovalHeaderValue(
  queryClient: QueryClient,
  userId: string,
): string {
  const mode = storedValue<typeof TOOL_APPROVAL_DEFAULT_KEY>(
    queryClient.getQueryData(
      userSettingKeys.detail(userId, TOOL_APPROVAL_DEFAULT_KEY),
    ),
  )
  const overrides = storedValue<typeof TOOL_APPROVAL_OVERRIDES_KEY>(
    queryClient.getQueryData(
      userSettingKeys.detail(userId, TOOL_APPROVAL_OVERRIDES_KEY),
    ),
  )
  return serializeToolApprovalPreference(
    mode === undefined
      ? readToolApprovalModeMirror()
      : parseToolApprovalMode(mode),
    effectiveToolApprovalOverrides(
      overrides === undefined
        ? readToolApprovalOverridesMirror()
        : normalizePerAgentOverrides(overrides),
    ),
  )
}

/**
 * The same value, bound to this app's principal and query cache.
 *
 * Stable across renders — it is a dependency of the session's `send`, and a
 * fresh identity each render would rebuild the session object every time.
 */
export function useToolApprovalHeaderValue(): () => string {
  const userId = useAgentPrincipalId()
  const queryClient = useQueryClient()
  return useCallback(
    () => toolApprovalHeaderValue(queryClient, userId),
    [queryClient, userId],
  )
}
