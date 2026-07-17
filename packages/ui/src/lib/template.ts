// Recursive `{key}` template substitution. Not ported from anywhere — the
// closest prior art (a prior in-house templating utility) turned
// out to be single-pass only (a value containing another `{key}` is inserted
// literally, never re-resolved), so this is a from-scratch implementation
// of the recursive behavior specifically.

const VAR_PATTERN = /\{([a-zA-Z_][\w.]*)\}/g

/** Every distinct `{key}` reference in a string, in first-seen order. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>()
  for (const match of text.matchAll(VAR_PATTERN)) seen.add(match[1])
  return Array.from(seen)
}

export interface ResolveTemplateResult {
  /** The template with every resolvable `{key}` substituted, recursively. */
  result: string
  /** Every key encountered across all resolution passes — including keys
   *  only reachable through another variable's value — not just the ones
   *  referenced directly in the input template. */
  usedVariables: string[]
  /** Keys still present as `{key}` in the final result: never defined in
   *  `vars`, or part of a cycle that never stabilized. */
  unresolvedVariables: string[]
  /** True if `maxDepth` passes ran out before the string stopped changing
   *  (a cycle, e.g. {a} -> "{b}", {b} -> "{a}", or a chain deeper than
   *  maxDepth) — `result` is the last pass's output, not a final value. */
  truncated: boolean
}

/**
 * Substitutes `{key}` -> `vars[key]` repeatedly, re-scanning each pass's
 * output for further `{key}` references, until the string stops changing
 * or `maxDepth` passes have run (guards against reference cycles).
 */
export function resolveTemplate(template: string, vars: Record<string, string>, maxDepth = 10): ResolveTemplateResult {
  const usedVariables = new Set<string>()
  let current = template
  let truncated = false

  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false
    current = current.replace(VAR_PATTERN, (match, key: string) => {
      usedVariables.add(key)
      // Object.hasOwn, not `key in vars` — the `in` operator also matches
      // inherited Object.prototype members, so a template containing
      // `{toString}` or `{constructor}` would substitute the actual
      // prototype method (stringified) instead of staying unresolved.
      if (!Object.hasOwn(vars, key)) return match
      changed = true
      return vars[key]
    })
    if (!changed) break
    if (depth === maxDepth - 1) truncated = true
  }

  return {
    result: current,
    usedVariables: Array.from(usedVariables),
    unresolvedVariables: extractVariables(current),
    truncated,
  }
}
