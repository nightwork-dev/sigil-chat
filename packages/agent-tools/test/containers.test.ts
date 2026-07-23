// Container slugs (SC.10, owner-authorized follow-up to session slugs):
// exercises the ACTUAL tool-call path an agent uses — sigil-project-upsert /
// sigil-workspace-upsert — rather than only the underlying registries
// (project-registry.test.ts / workspace-registry.test.ts already cover
// those directly). This is the one place particular to containers.ts: the
// create/update branch selection and the slug-stripping/preservation this
// batch added around it.

import type { AuthContext } from "@gonk/auth";
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { describe, expect, it } from "vitest";

import { ProjectRegistry } from "../../../apps/agent/agent/lib/project-registry.js";
import { WorkspaceRegistry } from "../../../apps/agent/agent/lib/workspace-registry.js";
import { sigilApprovalProvider } from "../src/approval.js";
import { registerContainerTools } from "../src/containers.js";

const OWNER: AuthContext = {
  principal: {
    id: "user-owner",
    kind: "human",
    identity: { issuer: "sigil:test", subject: "user-owner", method: "session" },
    roles: ["owner"],
    scopes: ["own"],
  },
  authorize: () => ({ outcome: "allow", reason: "test policy" }),
};

function memoryKv<T>(values = new Map<string, T>()) {
  return {
    delete: (key: string) => void values.delete(key),
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    get: (key: string) => values.get(key),
    list: (prefix = "") =>
      [...values.keys()].filter((key) => key.startsWith(prefix)),
    patch: () => {
      throw new Error("not implemented");
    },
    set: (key: string, value: T) => void values.set(key, value),
  };
}

function harness() {
  const projects = new ProjectRegistry({ store: memoryKv() });
  const workspaces = new WorkspaceRegistry({
    projects,
    store: memoryKv(),
  });
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });
  registerContainerTools(registry, { projects, workspaces });
  return { projects, registry, workspaces };
}

describe("registerContainerTools — container slugs", () => {
  it("mints a kebab-of-name slug through sigil-project-upsert's create branch", async () => {
    const { registry } = harness();

    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-project-upsert",
        {
          project: {
            id: "project-1",
            name: "Commerce Platform",
            description: "",
            members: [{ principalId: "user-owner", role: "owner" }],
            settings: {},
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );

    expect(outcome).toMatchObject({
      ok: true,
      data: { project: { slug: "commerce-platform" } },
    });
  });

  it("never lets an agent-supplied slug through on create — the registry mint always wins", async () => {
    const { registry } = harness();

    const outcome = await collectToolOutcome(
      registry.invoke(
        "sigil-project-upsert",
        {
          project: {
            id: "project-1",
            name: "Commerce Platform",
            description: "",
            slug: "attacker-chosen-slug",
            members: [{ principalId: "user-owner", role: "owner" }],
            settings: {},
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );

    expect(outcome).toMatchObject({
      ok: true,
      data: { project: { slug: "commerce-platform" } },
    });
  });

  it("never changes an existing project's slug on rename, even if the payload tries to", async () => {
    const { registry } = harness();
    const created = await collectToolOutcome(
      registry.invoke(
        "sigil-project-upsert",
        {
          project: {
            id: "project-1",
            name: "Commerce Platform",
            description: "",
            members: [{ principalId: "user-owner", role: "owner" }],
            settings: {},
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );
    const persisted = (created as { data: { project: { revision: number } } })
      .data.project;

    const renamed = await collectToolOutcome(
      registry.invoke(
        "sigil-project-upsert",
        {
          project: {
            id: "project-1",
            name: "Totally Different Name",
            description: "",
            slug: "hijacked-slug",
            members: [{ principalId: "user-owner", role: "owner" }],
            settings: {},
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
          expectedRevision: persisted.revision,
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );

    expect(renamed).toMatchObject({
      ok: true,
      data: {
        project: { name: "Totally Different Name", slug: "commerce-platform" },
      },
    });
  });

  it("mints a kebab-of-name slug through sigil-workspace-upsert's create branch, preserved across rename", async () => {
    const { registry } = harness();
    await collectToolOutcome(
      registry.invoke(
        "sigil-project-upsert",
        {
          project: {
            id: "project-1",
            name: "Commerce Platform",
            description: "",
            members: [{ principalId: "user-owner", role: "owner" }],
            settings: {},
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );

    const created = await collectToolOutcome(
      registry.invoke(
        "sigil-workspace-upsert",
        {
          workspace: {
            id: "workspace-1",
            projectId: "project-1",
            name: "Holiday Launch",
            description: "",
            status: "active",
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );
    expect(created).toMatchObject({
      ok: true,
      data: { workspace: { slug: "holiday-launch" } },
    });
    const persisted = (created as {
      data: { workspace: { revision: number } };
    }).data.workspace;

    const renamed = await collectToolOutcome(
      registry.invoke(
        "sigil-workspace-upsert",
        {
          workspace: {
            id: "workspace-1",
            projectId: "project-1",
            name: "Renamed Workspace",
            slug: "hijacked-slug",
            description: "",
            status: "active",
            createdAt: "2026-07-23T00:00:00.000Z",
            createdBy: "user-owner",
          },
          expectedRevision: persisted.revision,
        },
        makeBaseContext({ auth: OWNER }),
      ),
    );

    expect(renamed).toMatchObject({
      ok: true,
      data: {
        workspace: { name: "Renamed Workspace", slug: "holiday-launch" },
      },
    });
  });
});
