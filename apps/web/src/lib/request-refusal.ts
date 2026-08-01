// Shared shape for the server-side validation of request bytes: the refusal
// error every `createServerFn().validator()` in this app throws, and the two
// checks each of those validators opens with.
//
// Pure and client-safe on purpose — the validators that use it are exported
// from modules the browser imports, so this file must stay free of Node
// imports and of anything that pulls one in.
//
// A refusal is a 400: the request named a field, a type, or an id the surface
// does not accept. It is not an authorization verdict — those are decided in
// the `.server` half, and refusing early here never stands in for one.

/**
 * Base for validator refusals. Each surface subclasses it with its own name so
 * a caller can still discriminate which validator refused, and so `instanceof`
 * against the specific class keeps working.
 */
export class RequestRefusedError extends Error {
  readonly status = 400
}

/** Builds the caller's own refusal subclass from a message. */
export type RefuseRequest = (message: string) => RequestRefusedError

/**
 * Narrows unknown input to a plain object carrying only `allowedKeys`.
 *
 * Unexpected fields are refused rather than ignored: a request that names a
 * field this surface does not implement is a caller bug, and silently dropping
 * it lets a client believe a setting took effect.
 */
export function parseExactObject(
  input: unknown,
  allowedKeys: readonly string[],
  refuse: RefuseRequest,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw refuse("A request must be an object.")
  }
  const entry = input as Record<string, unknown>
  const unexpected = Object.keys(entry).filter(
    (key) => !allowedKeys.includes(key),
  )
  if (unexpected.length > 0) {
    throw refuse(`Unsupported fields: ${unexpected.join(", ")}.`)
  }
  return entry
}

/** A required boolean field — no coercion from `"true"`, `1`, or absence. */
export function parseRequiredBoolean(
  entry: Record<string, unknown>,
  key: string,
  refuse: RefuseRequest,
): boolean {
  const value = entry[key]
  if (typeof value !== "boolean") {
    throw refuse(`\`${key}\` must be a boolean.`)
  }
  return value
}
