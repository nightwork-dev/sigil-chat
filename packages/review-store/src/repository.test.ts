import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { SqliteAdapter } from "@mirk/store/sqlite";

import { createDraftArticleReviewDocument } from "./sample";
import {
  FileReviewRepository,
  REVIEW_RECORD_KEY,
  resolveReviewDatabasePath,
} from "./repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileReviewRepository", () => {
  it("shares human and agent edits across repository instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "review.json");
    const human = new FileReviewRepository(filePath);
    const agent = new FileReviewRepository(filePath);

    const initial = await human.get();
    const passage = initial.passages.find(({ id }) => id === "draft-02");
    if (!passage) throw new Error("Missing draft passage.");

    const humanEdit = await human.updatePassages(
      [
        {
          id: passage.id,
          body: "Human-authored current text.",
          expectedBody: passage.body,
        },
      ],
      initial.revision,
    );
    expect(humanEdit.applied).toBe(true);

    const inspectedByAgent = await agent.get();
    expect(
      inspectedByAgent.passages.find(({ id }) => id === passage.id)?.body,
    ).toBe("Human-authored current text.");

    const staleAgentEdit = await agent.updatePassages(
      [
        {
          id: passage.id,
          body: "Stale agent overwrite.",
          expectedBody: passage.body,
        },
      ],
      initial.revision,
    );
    expect(staleAgentEdit).toMatchObject({
      applied: false,
      conflict: {
        kind: "revision",
        expectedRevision: initial.revision,
        actualRevision: initial.revision + 1,
      },
    });

    expect(
      (await human.get()).passages.find(({ id }) => id === passage.id)?.body,
    ).toBe("Human-authored current text.");
  });

  it("persists review lifecycle state and revision history across reloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "review.json");
    const repository = new FileReviewRepository(
      filePath,
      () => "2026-07-16T20:00:00.000Z",
    );

    let document = await repository.get();
    const annotation = await repository.addAnnotations(
      [
        {
          passageIds: ["factcheck-01"],
          kind: "note",
          body: "Verify the alert window against production telemetry.",
          author: "human",
        },
      ],
      document.revision,
    );
    document = annotation.document;

    document = (
      await repository.resolveAnnotation(
        annotation.annotations[0]!.id,
        "converted",
        "Promoted during review",
        document.revision,
      )
    ).document;
    document = (
      await repository.lockDecision("decision-draft-owner", document.revision)
    ).document;
    document = (
      await repository.setAcceptanceCheck(
        "check-pressure",
        true,
        document.revision,
      )
    ).document;

    const reloaded = await new FileReviewRepository(filePath).get();
    expect(reloaded.revision).toBe(document.revision);
    expect(
      reloaded.annotations.find(
        ({ id }) => id === annotation.annotations[0]!.id,
      ),
    ).toMatchObject({
      status: "resolved",
      resolution: "converted",
      resolutionNote: "Promoted during review",
    });
    expect(
      reloaded.decisions.find(({ id }) => id === "decision-draft-owner"),
    ).toMatchObject({ status: "locked" });
    expect(
      reloaded.acceptance.checklist.find(({ id }) => id === "check-pressure"),
    ).toMatchObject({ checked: true });
    expect(reloaded.history[0]).toMatchObject({
      revision: reloaded.revision,
      label: "Completed acceptance check",
    });
  });

  it("rejects stale lifecycle mutations without changing the document", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileReviewRepository(join(directory, "review.json"));
    const initial = await repository.get();

    await repository.lockDecision("decision-draft-owner", initial.revision);

    await expect(
      repository.setAcceptanceCheck("check-pressure", true, initial.revision),
    ).rejects.toThrow(
      `Review revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
    expect(
      (await repository.get()).acceptance.checklist.find(
        ({ id }) => id === "check-pressure",
      ),
    ).toMatchObject({ checked: false });
  });

  it("serializes competing lifecycle mutations from separate SQLite adapters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "review.json");
    const human = new FileReviewRepository(filePath);
    const agent = new FileReviewRepository(filePath);
    const initial = await human.get();

    const results = await Promise.allSettled([
      human.lockDecision("decision-draft-owner", initial.revision),
      agent.setAcceptanceCheck("check-pressure", true, initial.revision),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason : undefined,
    ).toMatchObject({
      message: `Review revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    });
    expect((await human.get()).revision).toBe(initial.revision + 1);
  });

  it("does not lose a competing SQLite mutation from another repository instance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "review.json");
    const first = new FileReviewRepository(filePath);
    const second = new FileReviewRepository(filePath);
    const initial = await first.get();

    const results = await Promise.allSettled([
      first.updatePassages(
        [
          {
            id: "draft-02",
            body: "First concurrent edit.",
            expectedBody: initial.passages.find(({ id }) => id === "draft-02")!
              .body,
          },
        ],
        initial.revision,
      ),
      second.updatePassages(
        [
          {
            id: "draft-02",
            body: "Second concurrent edit.",
            expectedBody: initial.passages.find(({ id }) => id === "draft-02")!
              .body,
          },
        ],
        initial.revision,
      ),
    ]);

    expect(results).toHaveLength(2);
    expect(results.every(({ status }) => status === "fulfilled")).toBe(true);
    const updates = results.map((result) =>
      result.status === "fulfilled" ? result.value : undefined,
    );
    expect(updates.filter((result) => result?.applied)).toHaveLength(1);
    expect(updates.filter((result) => result?.applied === false)).toHaveLength(
      1,
    );
    expect((await first.get()).revision).toBe(initial.revision + 1);
  });

  it("imports a legacy JSON document into an empty SQLite database without changing the JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "review.json");
    const source = createDraftArticleReviewDocument();
    const { acceptance: _acceptance, history: _history, ...legacy } = source;
    const raw = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(filePath, raw, "utf8");

    const emptyDatabase = new SqliteAdapter({
      path: resolveReviewDatabasePath(filePath),
    });
    expect(emptyDatabase.kv.has(REVIEW_RECORD_KEY)).toBe(false);
    emptyDatabase.close();

    const repository = new FileReviewRepository(filePath);
    const imported = await repository.get();

    expect(imported.id).toBe(source.id);
    expect(imported.acceptance.checklist).toEqual(source.acceptance.checklist);
    expect(imported.history).toEqual(source.history);
    expect(await readFile(filePath, "utf8")).toBe(raw);
  });

  it("rolls back a SQLite mutation that throws after writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileReviewRepository(join(directory, "review.json"));
    const before = await repository.get();
    const adapter = new SqliteAdapter({ path: repository.databasePath });

    expect(() =>
      adapter.transaction(() => {
        adapter.kv.set(REVIEW_RECORD_KEY, {
          ...before,
          title: "Transient title that must not persist",
        });
        throw new Error("mid-transaction failure");
      }, "immediate"),
    ).toThrow("mid-transaction failure");
    adapter.close();

    expect(await repository.get()).toEqual(before);
  });

  it("reports a corrupt review store with its file path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileReviewRepository(join(directory, "review.json"));
    await writeFile(
      repository.filePath,
      JSON.stringify({
        id: "broken",
        title: "Broken",
        revision: 1,
        outline: [],
        passages: "not-an-array",
        decisions: [],
        annotations: [],
      }),
      "utf8",
    );

    await expect(repository.get()).rejects.toThrow(
      new RegExp(`Review store is corrupt at .*${repository.filePath}`),
    );
  });
});
