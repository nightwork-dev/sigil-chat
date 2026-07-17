import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isRecord, JsonFileStore } from "./index";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function makeStore() {
  const directory = await mkdtemp(join(tmpdir(), "sigil-file-store-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "state.json");
  return new JsonFileStore({
    filePath,
    lockLabel: "test",
    createInitial: () => ({ revision: 0 }),
    parse: (value) =>
      isRecord(value) && typeof value.revision === "number"
        ? { revision: value.revision }
        : undefined,
    corruptError: (path) => new Error(`Corrupt test store: ${path}`),
  });
}

describe("JsonFileStore", () => {
  it("initializes, validates, and atomically rewrites JSON", async () => {
    const store = await makeStore();

    await expect(store.read()).resolves.toEqual({ revision: 0 });
    await store.write({ revision: 1 });
    await expect(store.read()).resolves.toEqual({ revision: 1 });
  });

  it("reaps a dead-process lock before running a write operation", async () => {
    const store = await makeStore();
    await store.read();
    await writeFile(
      `${store.filePath}.lock`,
      JSON.stringify({ pid: 999999, createdAt: Date.now() }),
      "utf8",
    );

    await expect(
      store.withWriteLock(async () => {
        await store.write({ revision: 2 });
        return "written";
      }),
    ).resolves.toBe("written");
    await expect(store.read()).resolves.toEqual({ revision: 2 });
  });

  it("rejects structurally invalid JSON with the caller's domain error", async () => {
    const store = await makeStore();
    await writeFile(store.filePath, JSON.stringify({ revision: "wrong" }));

    await expect(store.read()).rejects.toThrow("Corrupt test store");
  });
});
