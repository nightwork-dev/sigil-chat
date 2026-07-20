import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileObjectStore } from "@mirk/artifact/fs";

import { SessionArtifactStore } from "../src/artifact-store.js";
import { handleArtifactImageRoute } from "../src/artifact-image-route.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("scoped artifact image reads", () => {
  it("rejects malformed or missing scopes before reading storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-artifact-image-"));
    directories.push(directory);
    const store = new SessionArtifactStore(
      new FileObjectStore({ root: join(directory, "objects") }),
    );

    await expect(
      handleArtifactImageRoute({
        apiKey: "service-key",
        authorization: "Bearer service-key",
        id: "artifact",
        scopeHeader: "session:",
        store,
      }),
    ).resolves.toEqual({ status: 400 });
  });

  it("hides a foreign artifact even when the claimed scope is valid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-artifact-image-"));
    directories.push(directory);
    const store = new SessionArtifactStore(
      new FileObjectStore({ root: join(directory, "objects") }),
    );
    const stored = await store.putFile({
      bytes: new TextEncoder().encode("private image"),
      mediaType: "image/png",
      scope: { tier: "session", id: "foreign" },
    });

    await expect(
      handleArtifactImageRoute({
        apiKey: "service-key",
        authorization: "Bearer service-key",
        id: stored.id,
        scopeHeader: "session:owned",
        store,
      }),
    ).resolves.toEqual({ status: 404 });
  });
});
