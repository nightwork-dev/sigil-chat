import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

import { checkWebHealth } from "./health.server";

const clients: ReturnType<typeof createClient>[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});

describe("web health", () => {
  it("proves the database accepts a write and read", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);

    await expect(checkWebHealth(client)).resolves.toBeUndefined();
    await expect(checkWebHealth(client)).resolves.toBeUndefined();
  });
});
