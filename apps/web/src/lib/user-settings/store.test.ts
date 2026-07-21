import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { createClient, type Client } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  SettingRevisionConflictError,
  SettingScopeNotAllowedError,
  getUserSettingRecord,
  resolveSettingCandidates,
  resolveFromTiers,
  resolveUserSetting,
  setUserSetting,
} from "./store"
import type { SettingDefinition } from "./registry"

const MIGRATION_SQL = readFileSync(
  resolve(import.meta.dirname, "../../../migrations/0002_user_settings.sql"),
  "utf8",
)

let client: Client

beforeEach(async () => {
  client = createClient({ url: ":memory:" })
  // user_settings.user_id references "user"(id); create a minimal stand-in so
  // the same schema (including the FK) exercises against real DDL.
  await client.executeMultiple(`
    CREATE TABLE "user" ("id" text not null primary key);
    INSERT INTO "user" ("id") VALUES ('user-1');
  `)
  await client.executeMultiple(MIGRATION_SQL)
})

afterEach(() => {
  client.close()
})

describe("setUserSetting + getUserSettingRecord", () => {
  it("creates a revision-1 record on first write", async () => {
    const record = await setUserSetting(client, {
      userId: "user-1",
      scopeKind: "user",
      scopeId: "",
      key: "appearance.mode",
      value: "dark",
    })
    expect(record.revision).toBe(1)

    const stored = await getUserSettingRecord(client, {
      userId: "user-1",
      scopeKind: "user",
      scopeId: "",
      key: "appearance.mode",
    })
    expect(stored?.value).toBe("dark")
    expect(stored?.revision).toBe(1)
  })

  it("rejects writing at a scope the key doesn't allow", async () => {
    await expect(
      setUserSetting(client, {
        userId: "user-1",
        scopeKind: "workspace",
        scopeId: "ws-1",
        key: "appearance.mode",
        value: "dark",
      }),
    ).rejects.toBeInstanceOf(SettingScopeNotAllowedError)
  })

  it("rejects an update whose expectedRevision no longer matches", async () => {
    await setUserSetting(client, {
      userId: "user-1",
      scopeKind: "user",
      scopeId: "",
      key: "appearance.mode",
      value: "dark",
    })
    // Someone else already bumped it to revision 1 → 2 out from under us.
    await setUserSetting(client, {
      userId: "user-1",
      scopeKind: "user",
      scopeId: "",
      key: "appearance.mode",
      value: "light",
      expectedRevision: 1,
    })

    await expect(
      setUserSetting(client, {
        userId: "user-1",
        scopeKind: "user",
        scopeId: "",
        key: "appearance.mode",
        value: "system",
        expectedRevision: 1, // stale
      }),
    ).rejects.toBeInstanceOf(SettingRevisionConflictError)
  })

  it("rejects creating with an expectedRevision when nothing exists yet", async () => {
    await expect(
      setUserSetting(client, {
        userId: "user-1",
        scopeKind: "user",
        scopeId: "",
        key: "appearance.mode",
        value: "dark",
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(SettingRevisionConflictError)
  })

  it("rejects an update with no expectedRevision when a record already exists", async () => {
    await setUserSetting(client, {
      userId: "user-1",
      scopeKind: "user",
      scopeId: "",
      key: "appearance.mode",
      value: "dark",
    })

    await expect(
      setUserSetting(client, {
        userId: "user-1",
        scopeKind: "user",
        scopeId: "",
        key: "appearance.mode",
        value: "light",
      }),
    ).rejects.toBeInstanceOf(SettingRevisionConflictError)
  })
})

describe("resolveUserSetting", () => {
  it("falls back to the registered default when nothing is written", async () => {
    const resolved = await resolveUserSetting(client, "appearance.mode", {
      userId: "user-1",
    })
    expect(resolved).toEqual({ value: "system", source: "default", revision: null })
  })

  it("gates resolution to only the tiers the registry allows for that key", async () => {
    // agent.activeChannelId only allows "user" scope in the registry. Seed
    // rows at all three tiers directly (bypassing registry scope gating, the
    // way a pre-existing or hand-inserted row might) and confirm
    // resolveUserSetting still only ever considers the user tier.
    for (const [kind, id, value] of [
      ["user", "", "user-value"],
      ["workspace", "ws-1", "workspace-value"],
      ["channel", "ch-1", "channel-value"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO user_settings (id, user_id, scope_kind, scope_id, key, value, revision, updated_at)
              VALUES (?, 'user-1', ?, ?, 'agent.activeChannelId', ?, 1, '2026-01-01')`,
        args: [`r-${kind}`, kind, id, JSON.stringify(value)],
      })
    }

    const resolved = await resolveUserSetting(client, "agent.activeChannelId", {
      userId: "user-1",
      workspaceId: "ws-1",
      channelId: "ch-1",
    })
    expect(resolved).toEqual({ value: "user-value", source: "user", revision: 1 })
  })
})

describe("resolveFromTiers", () => {
  it("prefers channel over workspace over user over nothing, in that order", async () => {
    for (const [kind, id, value] of [
      ["user", "", "user-value"],
      ["workspace", "ws-1", "workspace-value"],
      ["channel", "ch-1", "channel-value"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO user_settings (id, user_id, scope_kind, scope_id, key, value, revision, updated_at)
              VALUES (?, 'user-1', ?, ?, 'workspace.panelState', ?, 1, '2026-01-01')`,
        args: [`r-${kind}`, kind, id, JSON.stringify(value)],
      })
    }

    const allThree = await resolveFromTiers(client, "workspace.panelState", "user-1", [
      { kind: "channel", id: "ch-1" },
      { kind: "workspace", id: "ws-1" },
      { kind: "user", id: "" },
    ])
    expect(allThree?.source).toBe("channel")
    expect(allThree?.record.value).toBe("channel-value")

    // Drop the channel tier from the candidate list — workspace should win.
    const withoutChannel = await resolveFromTiers(client, "workspace.panelState", "user-1", [
      { kind: "workspace", id: "ws-1" },
      { kind: "user", id: "" },
    ])
    expect(withoutChannel?.source).toBe("workspace")
    expect(withoutChannel?.record.value).toBe("workspace-value")

    // Drop workspace too — user should win.
    const userOnly = await resolveFromTiers(client, "workspace.panelState", "user-1", [
      { kind: "user", id: "" },
    ])
    expect(userOnly?.source).toBe("user")
    expect(userOnly?.record.value).toBe("user-value")

    // No candidates written for → null, so the caller falls back to default.
    const none = await resolveFromTiers(client, "workspace.panelState", "user-1", [
      { kind: "channel", id: "ch-missing" },
    ])
    expect(none).toBeNull()
  })
})

describe("resolveSettingCandidates", () => {
  it("uses explicit semantic order and projects a permission-filtered receipt", () => {
    const definition: SettingDefinition<Record<string, string>> = {
      key: "agent.preference.example",
      allowedScopes: ["user"],
      allowedScopeKinds: ["installation", "organization", "personal"],
      allowedContributingLinkKinds: ["contributes-defaults"],
      mergeMode: "deep-merge",
      allowsPersonalOverride: true,
      affectsSecurity: false,
      defaultValue: {},
      isValid: (value): value is Record<string, string> =>
        typeof value === "object" && value !== null && !Array.isArray(value),
    }

    const resolved = resolveSettingCandidates(definition, [
      {
        scopeId: "person-1",
        scopeKind: "personal",
        order: 2,
        value: { personal: "always" },
        visibility: { kind: "discoverable" },
      },
      {
        scopeId: "organization-hidden",
        scopeKind: "installation",
        order: 0,
        value: { mandatory: "ask" },
        visibility: {
          kind: "hidden-mandatory-policy",
          policyClass: "installation-policy",
        },
      },
      {
        scopeId: "org-1",
        scopeKind: "organization",
        order: 1,
        value: { organization: "ask" },
        linkKind: "contributes-defaults",
        visibility: { kind: "discoverable" },
      },
    ])

    expect(resolved.value).toEqual({
      mandatory: "ask",
      organization: "ask",
      personal: "always",
    })
    expect(resolved.receipt).toEqual([
      { kind: "mandatory-policy", policyClass: "installation-policy" },
      { kind: "scope", scopeId: "org-1", scopeKind: "organization" },
      { kind: "scope", scopeId: "person-1", scopeKind: "personal" },
    ])
    expect(JSON.stringify(resolved.receipt)).not.toContain(
      "organization-hidden",
    )
    expect(JSON.stringify(resolved.receipt)).not.toContain('"mandatory":"ask"')
  })

  it("does not allow personal or linked input to widen a security setting", () => {
    // This intentionally bypasses defineSetting to prove the resolver keeps
    // the invariant when an untyped boundary constructs an unsafe definition.
    const unsafeDefinition = {
      key: "security.example",
      allowedScopes: ["user"],
      allowedScopeKinds: ["installation", "personal"],
      allowedContributingLinkKinds: ["contributes-defaults"],
      mergeMode: "replace",
      allowsPersonalOverride: true,
      affectsSecurity: true,
      defaultValue: "locked",
      isValid: (value: unknown): value is string => typeof value === "string",
    } as unknown as SettingDefinition<string>

    const resolved = resolveSettingCandidates(unsafeDefinition, [
      {
        scopeId: "installation-1",
        scopeKind: "installation",
        order: 0,
        value: "locked",
        visibility: { kind: "discoverable" },
      },
      {
        scopeId: "workspace-1",
        scopeKind: "installation",
        order: 1,
        value: "widened-through-link",
        linkKind: "contributes-defaults",
        visibility: { kind: "discoverable" },
      },
      {
        scopeId: "person-1",
        scopeKind: "personal",
        order: 2,
        value: "widened-personally",
        visibility: { kind: "discoverable" },
      },
    ])

    expect(resolved).toEqual({
      value: "locked",
      receipt: [
        { kind: "scope", scopeId: "installation-1", scopeKind: "installation" },
      ],
    })
  })
})
