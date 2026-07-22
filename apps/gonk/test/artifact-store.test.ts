import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileObjectStore } from "@mirk/artifact/fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  createScopeAccessCheck,
  SessionArtifactStore,
} from "../src/artifact-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SessionArtifactStore", () => {
  it("round-trips a durable text artifact with tier-isolated scopes", async () => {
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

    expect(stored.scope).toEqual({ tier: "session", id: scope });
    await expect(firstProcess.listBySession(scope)).resolves.toEqual([stored]);
    await expect(
      firstProcess.listByScope({ tier: "project", id: scope }),
    ).resolves.toEqual([]);
    await expect(
      firstProcess.listByScope({ tier: "persona", id: scope }),
    ).resolves.toEqual([]);

    const afterRestart = new SessionArtifactStore(
      new FileObjectStore({ root: directory }),
    );
    await expect(afterRestart.listBySession(scope)).resolves.toEqual([stored]);
    await expect(afterRestart.readContent(stored.id, scope)).resolves.toEqual({
      bytes,
      mediaType: "text/markdown",
    });
    await expect(afterRestart.listBySession("other-thread")).resolves.toEqual(
      [],
    );
  });

  it("re-authorizes a real artifact read after grant revocation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-artifacts-"));
    temporaryDirectories.push(directory);
    const objects = new FileObjectStore({ root: directory });
    const seed = new SessionArtifactStore(objects);
    const stored = await seed.putFile({
      bytes: new TextEncoder().encode("revocable material"),
      filename: "brief.md",
      mediaType: "text/markdown",
      scope: "workspace:holiday-launch",
    });

    let granted = true;
    const secured = new SessionArtifactStore(objects, {
      canAccessScope: createScopeAccessCheck({
        authorize: ({ principalId, resourceScope }) =>
          granted &&
          principalId === "user-grantee" &&
          resourceScope === "workspace:holiday-launch",
      }),
    });
    const principal = { id: "user-grantee" } as never;

    await expect(
      secured.readContent(stored.id, "workspace:holiday-launch", principal),
    ).resolves.toMatchObject({ mediaType: "text/markdown" });

    // No recreated store, no expired proof, and no changed perspective: the
    // authorization decision is repeated at this concrete byte-read boundary.
    granted = false;
    await expect(
      secured.readContent(stored.id, "workspace:holiday-launch", principal),
    ).rejects.toThrow("Access denied");
  });
});
