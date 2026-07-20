import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileObjectStore } from "@mirk/artifact/fs";
import { afterEach, describe, expect, it } from "vitest";

import { SessionArtifactStore } from "../src/artifact-store.js";
import { handleArtifactRoute } from "../src/artifact-routes.js";

const API_KEY = "test-artifact-key";
const EVIDENCE = "project:evidence-room";
const OTHER = "project:other-room";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function freshStore(): Promise<SessionArtifactStore> {
  const directory = await mkdtemp(join(tmpdir(), "sigil-artifact-routes-"));
  directories.push(directory);
  return new SessionArtifactStore(new FileObjectStore({ root: directory }));
}

async function seed(
  store: SessionArtifactStore,
  scope: string,
  filename: string,
  text: string,
): Promise<string> {
  const artifact = await store.putFile({
    bytes: new TextEncoder().encode(text),
    filename,
    mediaType: "text/markdown",
    scope,
  });
  return artifact.id;
}

describe("handleArtifactRoute", () => {
  it("returns 401 for a missing or wrong service bearer (list and delete)", async () => {
    const store = await freshStore();
    const base = {
      scopeHeader: EVIDENCE,
      legacyScopeHeader: undefined,
      id: undefined,
    };

    await expect(
      handleArtifactRoute(
        { ...base, method: "GET", authorization: undefined },
        { apiKey: API_KEY, store },
      ),
    ).resolves.toMatchObject({ status: 401 });

    await expect(
      handleArtifactRoute(
        { ...base, method: "DELETE", authorization: "Bearer nope", id: "x" },
        { apiKey: API_KEY, store },
      ),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("requires the x-sigil-scope header", async () => {
    const store = await freshStore();
    const result = await handleArtifactRoute(
      {
        method: "GET",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: undefined,
        legacyScopeHeader: undefined,
        id: undefined,
      },
      { apiKey: API_KEY, store },
    );
    expect(result.status).toBe(400);
  });

  it("lists a scope's artifacts with their content URLs, isolated by scope", async () => {
    const store = await freshStore();
    const id = await seed(store, EVIDENCE, "brief.md", "evidence one");

    const listed = await handleArtifactRoute(
      {
        method: "GET",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: EVIDENCE,
        legacyScopeHeader: undefined,
        id: undefined,
      },
      { apiKey: API_KEY, store },
    );
    expect(listed.status).toBe(200);
    expect(listed.json).toEqual([
      expect.objectContaining({
        id,
        filename: "brief.md",
        mediaType: "text/markdown",
        url: expect.stringContaining(
          `/api/media/artifact?key=${encodeURIComponent(id)}`,
        ),
      }),
    ]);

    // A different scope sees nothing.
    const other = await handleArtifactRoute(
      {
        method: "GET",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: OTHER,
        legacyScopeHeader: undefined,
        id: undefined,
      },
      { apiKey: API_KEY, store },
    );
    expect(other.json).toEqual([]);
  });

  it("deletes from the addressed scope only and leaves the shared blob", async () => {
    const store = await freshStore();
    // Identical bytes land in two scopes → same content-addressed id, one blob.
    const id = await seed(store, EVIDENCE, "shared.md", "shared bytes");
    await seed(store, OTHER, "shared.md", "shared bytes");

    const deleted = await handleArtifactRoute(
      {
        method: "DELETE",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: EVIDENCE,
        legacyScopeHeader: undefined,
        id,
      },
      { apiKey: API_KEY, store },
    );
    expect(deleted).toMatchObject({ status: 200, json: { deleted: true, id } });

    // Gone from evidence-room…
    await expect(store.listByScope(EVIDENCE)).resolves.toEqual([]);
    // …still present in the other scope, and the blob is intact (readable).
    await expect(store.listByScope(OTHER)).resolves.toHaveLength(1);
    await expect(store.readContent(id, OTHER)).resolves.toMatchObject({
      mediaType: "text/markdown",
    });
  });

  it("returns 404 deleting an id absent from the scope", async () => {
    const store = await freshStore();
    const result = await handleArtifactRoute(
      {
        method: "DELETE",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: EVIDENCE,
        legacyScopeHeader: undefined,
        id: "uploads/does-not-exist.md",
      },
      { apiKey: API_KEY, store },
    );
    expect(result.status).toBe(404);
  });

  it("rejects unsupported methods with 405", async () => {
    const store = await freshStore();
    const result = await handleArtifactRoute(
      {
        method: "PUT",
        authorization: `Bearer ${API_KEY}`,
        scopeHeader: EVIDENCE,
        legacyScopeHeader: undefined,
        id: undefined,
      },
      { apiKey: API_KEY, store },
    );
    expect(result.status).toBe(405);
  });
});
