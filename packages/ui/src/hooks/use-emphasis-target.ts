import {
  DEFAULT_EMPHASIS_TARGET_ATTRIBUTE,
  getEmphasisTargetProps,
} from "@workspace/ui/lib/imperative-emphasis"

/**
 * Marks an element as an explicit, semantically named target for imperative
 * emphasis. Callers never supply or receive a CSS selector — only an opaque
 * stable id. Pass `targetAttribute` to match a consumer's existing wire
 * contract (default matches `<EmphasisEffects>`'s default).
 */
export function useEmphasisTarget(
  targetId: string,
  targetAttribute: string = DEFAULT_EMPHASIS_TARGET_ATTRIBUTE,
): Record<string, string> {
  return getEmphasisTargetProps(targetId, targetAttribute)
}
