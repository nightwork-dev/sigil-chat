// VQ.1 acceptance criteria 2 and 3, against the real external roadmap store.
//
// The overlay's two acts are a `transitionStory` followed by an `addComment`,
// both through the same MirkWorkItemsRepository the server functions in
// ./work-items.ts reach for. This exercises that repository over a throwaway
// roadmap directory — a real markdown store with real git commits — rather
// than asserting against a double that cannot show the commit landing.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { MirkWorkItemsRepository } from "@workspace/work-items-store/mirk-repository"
import type { StoryComment } from "@workspace/work-items-store/types"

import { ownerPassComment, selectVerificationQueue } from "./verification-queue"

const directories: string[] = []

/**
 * A throwaway roadmap directory the repository is pointed at EXPLICITLY.
 *
 * The `.agents` marker and the realpath assertion keep any project-tier
 * resolution inside this root: an unresolved tier silently falls back to the
 * real home directory, which would mean a test writing durable state shared
 * across every run on the machine.
 */
function roadmapDirectory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sigil-vq-roadmap-")))
  mkdirSync(join(root, ".agents"))
  directories.push(root)
  return root
}

function repository(dir: string): MirkWorkItemsRepository {
  return new MirkWorkItemsRepository({ dir })
}

function gitLog(dir: string): string[] {
  return execFileSync("git", ["-C", dir, "log", "--pretty=%s"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("owner pass through the real roadmap store", () => {
  it("flips the story to shipped, commits it, and drops it out of the queue", async () => {
    const dir = roadmapDirectory()
    const store = repository(dir)

    const seeded = await store.get()
    expect(realpathSync(store.directory)).toBe(dir)
    const target = seeded.stories[0]
    await store.transitionStory(target.id, "verify", seeded.revision)

    const waiting = await store.list()
    expect(
      selectVerificationQueue(waiting).map((entry) => entry.story.id),
    ).toContain(target.id)

    // The overlay's check-off: transition first, then the owner-pass comment.
    const passedAt = "2026-08-01T23:59:00.000Z"
    const shipped = await store.transitionStory(target.id, "shipped")
    const comment: StoryComment = {
      id: "owner-pass-1",
      storyId: target.id,
      kind: "approval",
      author: "Owner",
      body: ownerPassComment(passedAt),
      createdAt: passedAt,
    }
    await store.addComment(comment, shipped.document.revision)

    // Criterion 2: the flip is durable in the external store, and it is a
    // commit in that repository — reread from a second instance, not from the
    // mutation result this process happens to be holding.
    const reread = await repository(dir).get()
    expect(reread.stories.find((item) => item.id === target.id)?.status).toBe(
      "shipped",
    )
    expect(selectVerificationQueue(reread.stories)).toEqual([])
    expect(gitLog(dir).length).toBeGreaterThan(1)
    expect(readFileSync(join(dir, `${target.id}.md`), "utf8")).toContain(
      "status: shipped",
    )

    // Criterion 3: the pass is recorded on the story with owner provenance and
    // the timestamp of the act.
    const landed = reread.comments.find((item) => item.storyId === target.id)
    expect(landed?.author).toBe("Owner")
    expect(landed?.kind).toBe("approval")
    expect(landed?.body).toContain(passedAt)
  })

  it("lands owner feedback as a comment on the story it is about", async () => {
    const dir = roadmapDirectory()
    const store = repository(dir)
    const seeded = await store.get()
    const target = seeded.stories[0]

    await store.addComment(
      {
        id: "owner-feedback-1",
        storyId: target.id,
        kind: "suggestion",
        author: "Owner",
        body: "The chip overlaps the agent dock at 375px.",
        createdAt: "2026-08-01T23:30:00.000Z",
      },
      seeded.revision,
    )

    const reread = await repository(dir).get()
    const landed = reread.comments.find(
      (comment) => comment.id === "owner-feedback-1",
    )
    expect(landed?.storyId).toBe(target.id)
    expect(landed?.author).toBe("Owner")
    expect(landed?.body).toContain("375px")
    expect(readFileSync(join(dir, `${target.id}.md`), "utf8")).toContain(
      "The chip overlaps the agent dock at 375px.",
    )
  })
})
