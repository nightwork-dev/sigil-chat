import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileObjectStore } from "@mirk/artifact/fs";
import { afterEach, describe, expect, it } from "vitest";

import { SessionArtifactStore } from "../src/artifact-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SessionArtifactStore", () => {
  it("round-trips a durable text artifact by session scope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-artifacts-"));
    temporaryDirectories.push(directory);
    const scope = "thread-round-trip";
    const bytes = new TextEncoder().encode("persistent notes");

    const firstProcess = new SessionArtifactStore(
      new FileObjectStore({ root: directory }),
    );
    const stored = await firstProcess.putFile({
      bytes,
      filename: "notes.md",
      mediaType: "text/markdown",
      scope,
    });

    await expect(firstProcess.listBySession(scope)).resolves.toEqual([stored]);

    const afterRestart = new SessionArtifactStore(
      new FileObjectStore({ root: directory }),
    );
    await expect(afterRestart.listBySession(scope)).resolves.toEqual([stored]);
    await expect(afterRestart.readContent(stored.id)).resolves.toEqual({
      bytes,
      mediaType: "text/markdown",
    });
    await expect(afterRestart.listBySession("other-thread")).resolves.toEqual(
      [],
    );
  });
});
