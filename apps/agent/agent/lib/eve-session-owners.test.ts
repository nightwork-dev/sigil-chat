import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import {
  MemoryEveSessionOwnerStore,
  MirkEveSessionOwnerStore,
} from "./eve-session-owners"

const temporaryDirectories: string[] = []
const executionBinding = {
  applicationThreadId: "thread-1",
  personaId: "agent-a",
  homeScopeId: "workspace-a",
  initialPerspective: {
    focusScopeId: "workspace-a",
    viaScopeIds: ["project-a"],
  },
  additionalContextScopeIds: ["workspace-b"],
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe("EveSessionOwnerStore", () => {
  it("persists an immutable session-to-subject binding through Mirk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-eve-owners-"))
    temporaryDirectories.push(directory)
    const first = new MirkEveSessionOwnerStore({
      cwd: directory,
      projectRoot: directory,
    })

    await first.bind("session-1", "user-1", executionBinding)
    await first.bind("session-1", "user-1", executionBinding)

    const reopened = new MirkEveSessionOwnerStore({
      cwd: directory,
      projectRoot: directory,
    })
    await expect(reopened.getOwner("session-1")).resolves.toBe("user-1")
    await expect(reopened.getBinding("session-1")).resolves.toEqual({
      subject: "user-1",
      ...executionBinding,
    })
    await expect(
      reopened.bind("session-1", "user-2", executionBinding),
    ).rejects.toThrow("already bound to another execution context")
  })

  it("fails closed when a Mirk owner record is corrupt", async () => {
    const values = new Map<string, unknown>([["session-1", { version: 1 }]])
    const store = new MirkEveSessionOwnerStore({
      store: memoryKv(values),
    })

    await expect(store.getOwner("session-1")).rejects.toThrow(
      "store is corrupt",
    )
  })

  it("rejects incomplete pre-V3 records instead of upgrading them", async () => {
    const values = new Map<string, unknown>([
      ["session-1", { sessionId: "session-1", subject: "user-1", version: 1 }],
    ])
    const store = new MirkEveSessionOwnerStore({ store: memoryKv(values) })

    await expect(store.getBinding("session-1")).rejects.toThrow(
      "store is corrupt",
    )
  })

  it("rejects rebinding in memory as well as on disk", async () => {
    const store = new MemoryEveSessionOwnerStore()
    await store.bind("session-1", "user-1", executionBinding)
    await expect(
      store.bind("session-1", "user-1", {
        ...executionBinding,
        personaId: "agent-b",
      }),
    ).rejects.toThrow("already bound to another execution context")
    await expect(
      store.bind("session-1", "user-2", executionBinding),
    ).rejects.toThrow("already bound to another execution context")
  })

  it("persists and enforces the complete V3 execution binding", async () => {
    const values = new Map<string, unknown>()
    const store = new MirkEveSessionOwnerStore({ store: memoryKv(values) })

    await store.bind("session-1", "user-1", executionBinding)
    await store.bind("session-1", "user-1", executionBinding)

    await expect(store.getBinding("session-1")).resolves.toEqual({
      subject: "user-1",
      ...executionBinding,
    })
    expect(values.get("session-1")).toEqual({
      sessionId: "session-1",
      subject: "user-1",
      version: 3,
      ...executionBinding,
    })

    await expect(
      store.bind("session-1", "user-1", {
        ...executionBinding,
        homeScopeId: "workspace-other",
      }),
    ).rejects.toThrow("already bound")
  })

  it("persists participant-channel binding and rejects cross-participant rebinding", async () => {
    const values = new Map<string, unknown>()
    const store = new MirkEveSessionOwnerStore({ store: memoryKv(values) })
    const participantBinding = {
      ...executionBinding,
      channel: channelFor("participant-ada", "session-1"),
    }

    await store.bind("session-1", "user-1", participantBinding)
    await expect(store.getBinding("session-1")).resolves.toEqual({
      subject: "user-1",
      ...participantBinding,
    })
    expect(values.get("session-1")).toEqual({
      sessionId: "session-1",
      subject: "user-1",
      version: 3,
      ...participantBinding,
    })

    await expect(
      store.bind("session-1", "user-1", {
        ...participantBinding,
        channel: channelFor("participant-beatrice", "session-1"),
      }),
    ).rejects.toThrow("already bound")
  })
})

function channelFor(participantId: string, runtimeSessionId: string) {
  return {
    channelId: "channel-1",
    ownerPrincipalId: "user-1",
    participants: [
      {
        kind: "human",
        participantId: "participant-owner",
        principalId: "user-1",
        role: "owner",
      },
      {
        applicationThreadId: "thread-1",
        runtimeSessionId,
        kind: "persona-session",
        participantId,
        personaId: "agent-a",
        principalId: "user-1",
        role: "participant",
      },
    ],
  } as const
}

function memoryKv(values: Map<string, unknown>): KvStore<unknown> {
  return {
    delete: (key) => void values.delete(key),
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    get: (key) => values.get(key),
    list: (prefix = "") =>
      [...values.keys()].filter((key) => key.startsWith(prefix)),
    patch: () => {
      throw new Error("not implemented")
    },
    set: (key, value) => void values.set(key, value),
  }
}
