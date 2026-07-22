import { readFileSync } from "node:fs"

import { createAuthDatabase } from "../src/lib/auth/db"
import { readAuthEnvironment } from "../src/lib/auth/env"
import { createSigilAuth } from "../src/lib/auth/server"

interface DevOwnerCredentials {
  email: string
  name: string
  password: string
  username: string
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Development owner seeding cannot run in production.")
}

const credentialsPath = process.env.SIGIL_DEV_OWNER_CREDENTIALS_FILE
if (!credentialsPath) {
  throw new Error("SIGIL_DEV_OWNER_CREDENTIALS_FILE is required.")
}

const credentials = readCredentials(credentialsPath)
const environment = readAuthEnvironment()
const database = createAuthDatabase(environment)

try {
  const users = await database.client.execute(
    "SELECT email, role FROM user ORDER BY createdAt LIMIT 2",
  )
  if (users.rows.length > 0) {
    const expectedOwner = users.rows.some(
      (row) => row.email === credentials.email && row.role === "owner",
    )
    process.stdout.write(
      expectedOwner
        ? `Development owner already exists: ${credentials.email}\n`
        : "Existing development account preserved; owner seed skipped.\n",
    )
  } else {
    const auth = createSigilAuth({ ...database, environment })
    const response = await auth.handler(
      new Request(new URL("/api/auth/sign-up/email", environment.baseUrl), {
        body: JSON.stringify(credentials),
        headers: {
          "content-type": "application/json",
          origin: environment.baseUrl,
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      }),
    )

    if (!response.ok) {
      throw new Error(
        `Could not seed the development owner (HTTP ${response.status}): ${await response.text()}`,
      )
    }
    process.stdout.write(`Created development owner: ${credentials.email}\n`)
  }
} finally {
  await database.kysely.destroy()
  database.client.close()
}

function readCredentials(path: string): DevOwnerCredentials {
  const value = JSON.parse(
    readFileSync(path, "utf8"),
  ) as Partial<DevOwnerCredentials>
  if (
    typeof value.email !== "string" ||
    typeof value.name !== "string" ||
    typeof value.password !== "string" ||
    value.password.length < 16 ||
    typeof value.username !== "string"
  ) {
    throw new Error(`Invalid development owner credentials at ${path}`)
  }
  return value as DevOwnerCredentials
}
