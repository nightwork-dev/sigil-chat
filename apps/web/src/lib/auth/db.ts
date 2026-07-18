import { createClient, type Client } from "@libsql/client"
import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"

import type { AuthEnvironment } from "./env"

export interface AuthDatabase {
  client: Client
  kysely: Kysely<Record<string, unknown>>
}

export function createAuthDatabase(
  environment: Pick<AuthEnvironment, "databaseAuthToken" | "databaseUrl">,
): AuthDatabase {
  const options = {
    authToken: environment.databaseAuthToken,
    url: environment.databaseUrl,
  }

  return {
    client: createClient(options),
    kysely: new Kysely({ dialect: new LibsqlDialect(options) }),
  }
}
