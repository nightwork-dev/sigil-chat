import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { FileReviewRepository } from "./repository";

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
    const passage = initial.passages.find(({ id }) => id === "preflight-02");
    if (!passage) throw new Error("Missing preflight passage.");

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
          passageIds: ["monitoring-01"],
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
      await repository.lockDecision(
        "decision-preflight-owner",
        document.revision,
      )
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
      reloaded.decisions.find(({ id }) => id === "decision-preflight-owner"),
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

    await repository.lockDecision("decision-preflight-owner", initial.revision);

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

  it("reaps a lock held by a dead process without waiting for the hard stale age", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileReviewRepository(join(directory, "review.json"));
    const initial = await repository.get();
    await writeFile(
      `${repository.filePath}.lock`,
      JSON.stringify({ pid: 999999, createdAt: Date.now() }),
      "utf8",
    );

    const result = await repository.lockDecision(
      "decision-preflight-owner",
      initial.revision,
    );

    expect(result.document.revision).toBe(initial.revision + 1);
  });

  it("reaps an unparseable lock after the hard stale age", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-review-store-"));
    temporaryDirectories.push(directory);
    const repository = new FileReviewRepository(join(directory, "review.json"));
    const initial = await repository.get();
    const lockPath = `${repository.filePath}.lock`;
    const old = new Date(Date.now() - 61_000);
    await writeFile(lockPath, "not-json", "utf8");
    await utimes(lockPath, old, old);

    const result = await repository.setAcceptanceCheck(
      "check-pressure",
      true,
      initial.revision,
    );

    expect(result.document.revision).toBe(initial.revision + 1);
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
