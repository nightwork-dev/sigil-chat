// SC.10 §9.8(c) — `@` is the composer's inline trigger for the Add menu
// ("mentions/attaches an entity"); `/` is deliberately not implemented (that
// would advertise a command palette, which is not this menu's job). Typing
// `@` only opens the menu at a WORD boundary — start of input, or preceded
// by whitespace — so an email address or a mid-word `@` (rare, but typable)
// doesn't hijack composing.

/** True when inserting a character at `cursorIndex` in `value` lands at a
 *  word boundary — the start of the text, or immediately after whitespace.
 *  Pure so the composer's keydown handler and its tests share one rule. */
export function isAtWordBoundary(value: string, cursorIndex: number): boolean {
  if (cursorIndex <= 0) return true
  const before = value[cursorIndex - 1]
  return before !== undefined && /\s/.test(before)
}
