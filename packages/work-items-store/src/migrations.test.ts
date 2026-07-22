import { describe, expect, it } from "vitest";

import { migrateLegacyStoryMarkdown } from "./migrations.js";

describe("scoped-work roadmap migration", () => {
  it("adds the identity floor without changing legacy content", () => {
    const legacy = `---
id: S1.10
title: Durable specs
createdAt: 2026-07-21T21:15:00.000Z
---

Keep this body and its comments byte-for-byte.
`;

    const migrated = migrateLegacyStoryMarkdown(legacy);

    expect(migrated).toContain("kind: story");
    expect(migrated).toContain("homeScopeId: installation:default");
    expect(migrated).toContain("scopeBindings: []");
    expect(migrated).toContain("actorPrincipalId: principal:roadmap-migration");
    expect(migrated).toContain("revision: 1");
    expect(migrated?.endsWith("Keep this body and its comments byte-for-byte.\n")).toBe(true);
  });

  it("does not rewrite a current record", () => {
    const current = `---
id: S1.10
kind: story
homeScopeId: installation:default
scopeBindings: []
provenance:
  origin: principal
  actorPrincipalId: principal:test
  createdAt: 2026-07-21T21:15:00.000Z
revision: 1
---
`;

    expect(migrateLegacyStoryMarkdown(current)).toBeUndefined();
  });
});
