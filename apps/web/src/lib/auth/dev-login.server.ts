import { timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"

import { readAuthEnvironment } from "./env"
import { getAuth } from "./server"

interface DevelopmentOwnerCredentials {
  email: string
  password: string
}

export interface DevelopmentLoginDependencies {
  baseUrl: string
  consumeToken: () => void
  credentials: DevelopmentOwnerCredentials
  expectedToken: string | undefined
  isProduction: boolean
  signIn: (credentials: DevelopmentOwnerCredentials) => Promise<Response>
}

export async function handleDevelopmentLogin(
  request: Request,
  dependencies: DevelopmentLoginDependencies,
): Promise<Response> {
  const url = new URL(request.url)
  const suppliedToken = url.searchParams.get("token")
  if (
    dependencies.isProduction ||
    url.origin !== dependencies.baseUrl ||
    !dependencies.expectedToken ||
    !suppliedToken ||
    !equalTokens(suppliedToken, dependencies.expectedToken)
  ) {
    return notFound()
  }

  const signIn = await dependencies.signIn(dependencies.credentials)
  if (!signIn.ok) {
    return new Response("Development owner sign-in failed.", {
      headers: { "cache-control": "no-store" },
      status: 503,
    })
  }

  dependencies.consumeToken()
  const headers = new Headers({
    "cache-control": "no-store",
    location: "/chat",
    "referrer-policy": "no-referrer",
  })
  for (const cookie of responseCookies(signIn.headers)) {
    headers.append("set-cookie", cookie)
  }
  return new Response(null, { headers, status: 302 })
}

export async function developmentLogin(request: Request): Promise<Response> {
  const environment = readAuthEnvironment()
  const expectedToken = process.env.SIGIL_DEV_LOGIN_TOKEN
  const credentialsPath = process.env.SIGIL_DEV_OWNER_CREDENTIALS_FILE
  if (!expectedToken || !credentialsPath) return notFound()

  return handleDevelopmentLogin(request, {
    baseUrl: environment.baseUrl,
    consumeToken: () => {
      if (process.env.SIGIL_DEV_LOGIN_TOKEN === expectedToken) {
        delete process.env.SIGIL_DEV_LOGIN_TOKEN
      }
    },
    credentials: readDevelopmentOwnerCredentials(credentialsPath),
    expectedToken,
    isProduction: environment.isProduction,
    signIn: async (credentials) =>
      (await getAuth()).handler(
        new Request(new URL("/api/auth/sign-in/email", environment.baseUrl), {
          body: JSON.stringify(credentials),
          headers: {
            "content-type": "application/json",
            origin: environment.baseUrl,
            "x-forwarded-for": "127.0.0.1",
          },
          method: "POST",
        }),
      ),
  })
}

function readDevelopmentOwnerCredentials(
  path: string,
): DevelopmentOwnerCredentials {
  const value = JSON.parse(
    readFileSync(path, "utf8"),
  ) as Partial<DevelopmentOwnerCredentials>
  if (
    typeof value.email !== "string" ||
    typeof value.password !== "string" ||
    value.password.length < 16
  ) {
    throw new Error(`Invalid development owner credentials at ${path}`)
  }
  return { email: value.email, password: value.password }
}

function equalTokens(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}

function responseCookies(headers: Headers): string[] {
  const withCookieList = headers as Headers & { getSetCookie?: () => string[] }
  return (
    withCookieList.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : [])
  )
}

function notFound(): Response {
  return new Response("Not found", {
    headers: { "cache-control": "no-store" },
    status: 404,
  })
}
