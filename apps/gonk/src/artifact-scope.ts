export const SIGIL_SESSION_SCOPE_HEADER = "x-sigil-session-id"
export const SIGIL_SESSION_SCOPE_AUTH_INFO_KEY = "sigilSessionScope"

const MAX_SESSION_SCOPE_LENGTH = 256

export function normalizeSessionScope(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim()
  if (
    !normalized ||
    normalized.length > MAX_SESSION_SCOPE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return undefined
  }
  return normalized
}
