import { getRequestHeaders } from "@tanstack/react-start/server"

import { getAuth, type SigilAuthSession } from "./server"

export class AuthenticationRequiredError extends Error {
  readonly status = 401

  constructor() {
    super("Authentication required")
    this.name = "AuthenticationRequiredError"
  }
}

export class OwnerRequiredError extends Error {
  readonly status = 403

  constructor() {
    super("Owner access required")
    this.name = "OwnerRequiredError"
  }
}

export async function getSession(headers: Headers = getRequestHeaders()) {
  return (await getAuth()).api.getSession({ headers })
}

export async function getEveBearerToken(
  headers: Headers = getRequestHeaders(),
): Promise<string> {
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers })
  requireSession(session)
  const result = await auth.api.getToken({ headers })
  if (!result.token) throw new AuthenticationRequiredError()
  return result.token
}

export function requireSession(
  session: SigilAuthSession | null,
): asserts session is SigilAuthSession {
  if (!session) throw new AuthenticationRequiredError()
}

export function requireOwner(
  session: SigilAuthSession | null,
): asserts session is SigilAuthSession {
  requireSession(session)
  if (session.user.role !== "owner") throw new OwnerRequiredError()
}
